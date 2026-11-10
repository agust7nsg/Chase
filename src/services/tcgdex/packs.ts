import { normalizeCards, normalizeSet, record } from './normalize';
import { CatalogError, type CatalogSet, type CatalogStorage, type CatalogCardBrief } from './types';

export interface CatalogPack { schema: 1; language: 'en'; revision: string; set: CatalogSet; cards: Record<string, unknown>[]; fetchedAt?: number }
export interface PackIndex { schema: 1; language: 'en'; revision: string; generatedAt: string; sets: CatalogSet[]; packs?: Record<string, string> }
export interface PackResource { value: unknown; savedAt: number; fromCache: boolean; stale: boolean }
const failure = () => new CatalogError('INVALID_RESPONSE', 'Invalid catalog package.');
const safeId = (id: string) => /^[a-zA-Z0-9.-]{1,80}$/.test(id);
export function validatePack(value: unknown, id: string): CatalogPack {
  if (!record(value) || value.schema !== 1 || value.language !== 'en' || typeof value.revision !== 'string' || value.revision.length > 160 || !Array.isArray(value.cards) || value.cards.length > 3000) throw failure();
  const set = normalizeSet(value.set); if (set.id !== id || !safeId(id)) throw failure();
  const ids = new Set();
  for (const raw of value.cards) {
    if (!record(raw) || typeof raw.localId !== 'string' || raw.id !== `${id}-${raw.localId}` || ids.has(raw.id)) throw failure();
    if (raw.set && (!record(raw.set) || raw.set.id !== id)) throw failure();
    normalizeCards({ ...raw, set }, 'en'); ids.add(raw.id);
  }
  if (value.fetchedAt !== undefined && (typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt) || value.fetchedAt < 0)) throw failure();
  return { schema: 1, language: 'en', revision: value.revision, set, cards: value.cards as Record<string, unknown>[], ...(typeof value.fetchedAt === 'number' ? { fetchedAt: value.fetchedAt } : {}) };
}
export function validatePackIndex(value: unknown): PackIndex {
  if (!record(value) || value.schema !== 1 || value.language !== 'en' || typeof value.revision !== 'string' || typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt)) || !Array.isArray(value.sets) || value.sets.length > 2000) throw failure();
  const sets = value.sets.map(normalizeSet); const ids = new Set();
  for (const set of sets) { if (!safeId(set.id) || ids.has(set.id)) throw failure(); ids.add(set.id); }
  const packs: Record<string, string> = {};
  if (value.packs !== undefined) {
    if (!record(value.packs)) throw failure();
    for (const [id, file] of Object.entries(value.packs)) {
      if (!ids.has(id) || typeof file !== 'string' || !/^packs\/[a-f0-9]{64}\.json$/.test(file)) throw failure();
      packs[id] = file;
    }
  }
  return { schema: 1, language: 'en', revision: value.revision, generatedAt: value.generatedAt, sets, packs };
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Catalog-only storage. No ownership, Auth, plan, trial or ScanSession keys are touched. */
export class CatalogPackStore {
  private index: PackIndex;
  private readonly memory = new Map<string, CatalogPack>();
  private readonly attempted = new Set<string>();
  private readonly pending = new Map<string, Promise<CatalogPack | undefined>>();
  private lastSync = -Infinity;
  private storageHealthy = true;
  private writes: Promise<void> = Promise.resolve();
  private searchIndex?: Map<string, CatalogCardBrief[]>;
  private readonly searchUpdates = new Map<string, CatalogCardBrief[]>();
  private readonly prefix = 'chase.catalog-packs.v1:';
  constructor(private options: { index: unknown; loaders: Record<string, () => unknown>; search?: () => (CatalogCardBrief & { setId: string })[]; storage?: CatalogStorage; fetch?: typeof fetch; baseUrl?: string; now?: () => number }) {
    this.index = validatePackIndex(options.index);
    if (options.baseUrl && (!options.baseUrl.startsWith('https://') || new URL(options.baseUrl).username || new URL(options.baseUrl).password)) throw failure();
  }
  listSets(): CatalogSet[] { return copy(this.index.sets); }
  hasBundledSet(id: string) { return Boolean(this.options.loaders[id]); }
  searchSets(): { set: CatalogSet; cards: CatalogCardBrief[] }[] {
    if (!this.searchIndex) {
      this.searchIndex = new Map();
      for (const row of this.options.search?.() ?? []) {
        const list = this.searchIndex.get(row.setId) ?? []; list.push(row); this.searchIndex.set(row.setId, list);
      }
    }
    return this.index.sets.map(set => ({ set, cards: this.searchUpdates.get(set.id) ?? this.searchIndex!.get(set.id) ?? [] }));
  }
  private now() { return (this.options.now ?? Date.now)(); }
  private async io<T>(work: Promise<T>): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise<undefined>(resolve => { timer = setTimeout(() => { this.storageHealthy = false; resolve(undefined); }, 250); })]); } catch { this.storageHealthy = false; return undefined; }
    finally { if (timer) clearTimeout(timer); }
  }
  private remember(pack: CatalogPack) {
    this.searchUpdates.set(pack.set.id, pack.cards.map(({ id, localId, name, image }) => ({ id, localId, name, image })) as CatalogCardBrief[]);
    this.memory.delete(pack.set.id); this.memory.set(pack.set.id, pack);
    while (this.memory.size > 8) this.memory.delete(this.memory.keys().next().value!);
    return pack;
  }
  async getSet(id: string): Promise<CatalogPack | undefined> {
    if (!safeId(id)) return undefined;
    if (this.memory.has(id)) return this.memory.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    const work = (async () => {
      let saved: CatalogPack | undefined;
      const text = this.storageHealthy ? await this.io(this.options.storage?.getItem(`${this.prefix}set:${id}`) ?? Promise.resolve(null)) : null;
      try { if (text) saved = validatePack(JSON.parse(text), id); } catch { /* Keep the immutable installed base. */ }
      const base = this.options.loaders[id]?.();
      const bundled = base ? validatePack(base, id) : undefined;
      // Price-bearing saved snapshots survive offline restarts; never replace them with an unpriced base.
      let result = saved ?? bundled;
      if (saved && bundled && (saved.fetchedAt ?? 0) < Date.parse(this.index.generatedAt)) {
        const previous = new Map(saved.cards.map(card => [card.id, card]));
        result = { ...bundled, fetchedAt: saved.fetchedAt, cards: bundled.cards.map(card => ({ ...card, ...(previous.get(card.id)?.pricing ? { pricing: previous.get(card.id)!.pricing } : {}) })) };
      }
      return result ? this.remember(result) : undefined;
    })();
    this.pending.set(id, work);
    try { return await work; } finally { this.pending.delete(id); }
  }
  async save(pack: CatalogPack): Promise<void> {
    let safe = validatePack(pack, pack.set.id);
    const old = await this.getSet(safe.set.id);
    if (old && (old.fetchedAt ?? 0) > (safe.fetchedAt ?? 0)) {
      const quotes = new Map(old.cards.map(card => [card.id, card.pricing]));
      safe = { ...safe, fetchedAt: old.fetchedAt, cards: safe.cards.map(card => ({ ...card, ...(quotes.has(card.id) ? { pricing: quotes.get(card.id) } : {}) })) };
    }
    this.remember(safe);
    await this.write(`${this.prefix}set:${safe.set.id}`, JSON.stringify(safe));
  }
  private async write(key: string, value: string) {
    const work = this.writes.then(async () => { if (this.storageHealthy && this.options.storage) await this.io(this.options.storage.setItem(key, value)); });
    this.writes = work.catch(() => {}); await work;
  }
  async read(path: string): Promise<PackResource | undefined> {
    if (path === 'sets' || path.startsWith('sets?')) return { value: this.listSets(), savedAt: Date.parse(this.index.generatedAt), fromCache: true, stale: false };
    if (path.startsWith('sets/')) {
      const pack = await this.getSet(decodeURIComponent(path.slice(5)));
      if (pack) return { value: { ...pack.set, cards: pack.cards.map(({ id, localId, name, image }) => ({ id, localId, name, image })) }, savedAt: pack.fetchedAt ?? 0, fromCache: true, stale: false };
    }
    if (path.startsWith('cards/')) {
      const id = decodeURIComponent(path.slice(6));
      const setId = this.index.sets.filter(set => id.startsWith(`${set.id}-`)).sort((a,b) => b.id.length - a.id.length)[0]?.id;
      const pack = setId ? await this.getSet(setId) : undefined;
      const card = pack?.cards.find(card => card.id === id);
      if (card) return { value: { ...card, set: pack!.set }, savedAt: pack!.fetchedAt ?? 0, fromCache: true, stale: false };
    }
    return undefined;
  }
  /** One public manifest, then immutable changed packages; a failed update leaves the installed base usable. */
  async sync(signal: AbortSignal, beforeBatch?: () => Promise<void>): Promise<void> {
    if (!this.options.baseUrl || signal.aborted || this.now() - this.lastSync < 60 * 60 * 1000) return;
    this.lastSync = this.now();
    try {
      const text = await this.io(this.options.storage?.getItem(`${this.prefix}index`) ?? Promise.resolve(null));
      if (text) { const saved = validatePackIndex(JSON.parse(text)); if (Date.parse(saved.generatedAt) >= Date.parse(this.index.generatedAt)) this.index = saved; }
      const next = validatePackIndex(await this.download('manifest.json', signal));
      if (Date.parse(next.generatedAt) < Date.parse(this.index.generatedAt)) return;
      for (const set of next.sets) {
        if (signal.aborted) return;
        const file = next.packs?.[set.id]; if (!file || this.attempted.has(file)) continue;
        await beforeBatch?.(); if (signal.aborted) return;
        const current = await this.getSet(set.id);
        if (this.index.packs?.[set.id] === file && current?.revision === file.slice(6, -5)) { this.attempted.add(file); continue; }
        const pack = validatePack(await this.download(file, signal), set.id);
        if (pack.revision !== file.slice(6,-5) || signal.aborted) throw failure();
        await this.save(pack); this.attempted.add(file);
      }
      if (!signal.aborted) { this.index = next; await this.write(`${this.prefix}index`, JSON.stringify(next)); }
    } catch { if (signal.aborted) this.lastSync = -Infinity; /* Catalog updates are optional, never a startup dependency. */ }
  }
  private async download(file: string, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController(); const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (signal.aborted) throw failure();
      return await Promise.race([(async () => {
        const response = await (this.options.fetch ?? fetch)(`${this.options.baseUrl}/${file}`, { signal: controller.signal });
        if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 4_000_000) throw failure();
        const text = await response.text(); if (text.length > 4_000_000 || controller.signal.aborted) throw failure();
        return JSON.parse(text);
      })(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { cancel(); reject(failure()); }, 6000); })]);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }
}
