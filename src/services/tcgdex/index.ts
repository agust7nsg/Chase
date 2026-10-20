import type { Card } from '../../types/domain';
import type { CardCatalogService } from '../contracts';
import { compareCardPrices, orderedSetCards, priceRepresentative } from './organization';
import { normalizeBrief, normalizeCards, normalizeSet, normalizeSetDetails, parseCollectibleId, record } from './normalize';
import { CatalogError, type CatalogPage, type CatalogQuery, type CatalogSet, type CatalogSetDetails, type TcgDexOptions } from './types';

export * from './types';
export { collectibleId } from './normalize';

interface Cached { savedAt: number; value: unknown }
interface Resource { value: unknown; fromCache: boolean; stale: boolean; savedAt?: number }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const abortError = () => new CatalogError('ABORTED', 'Catalog request canceled.');

/** The public REST adapter never substitutes the bundled scanner examples. */
export class TcgDexCatalogService implements CardCatalogService {
  private readonly options: TcgDexOptions;
  private readonly cache = new Map<string, Cached>();
  private readonly pending = new Map<string, Promise<Resource>>();
  private readonly language: string;
  private readonly base: string;
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly maxCacheEntries: number;
  private persistence: Promise<void> = Promise.resolve();
  private recognitionRefreshAt = -Infinity;

  constructor(options: TcgDexOptions = {}) {
    this.options = options;
    this.language = options.language ?? 'en';
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(this.language)) throw new Error('Invalid catalog language.');
    this.base = `${(options.baseUrl ?? 'https://api.tcgdex.net/v2').replace(/\/$/, '')}/${this.language}`;
    if (!this.base.startsWith('https://')) throw new Error('Catalog requests require HTTPS.');
    this.now = options.now ?? Date.now;
    this.ttl = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.maxCacheEntries = Math.max(1, Math.floor(options.maxCacheEntries ?? 250));
  }

  private key(path: string): string { return `chase.tcgdex.v1:${this.language}:${path}`; }

  private remember(path: string, entry: Cached): void {
    this.cache.delete(path);
    this.cache.set(path, entry);
    while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
  }

  private async persist(path: string, entry: Cached): Promise<void> {
    const storage = this.options.storage;
    if (!storage) return;
    const next = this.persistence.then(async () => {
      const indexKey = this.key('cache-index');
      let paths: string[] = [];
      try {
        const value: unknown = JSON.parse(await storage.getItem(indexKey) ?? '[]');
        if (Array.isArray(value)) paths = value.filter((item): item is string => typeof item === 'string' && item !== path);
      } catch { /* A corrupt index does not prevent saving a new cache entry. */ }
      paths.push(path);
      const evicted = paths.splice(0, Math.max(0, paths.length - this.maxCacheEntries));
      await storage.setItem(this.key(path), JSON.stringify({ version: 1, ...entry }));
      await storage.setItem(indexKey, JSON.stringify(paths));
      if (storage.removeItem) await Promise.all(evicted.map(old => storage.removeItem!(this.key(old))));
    });
    this.persistence = next.catch(() => {});
    await next;
  }

  private validate(path: string, value: unknown): void {
    if (path.split('?')[0] === 'sets') {
      if (!Array.isArray(value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid set list.');
      value.forEach(normalizeSet);
    } else if (path.startsWith('sets/')) {
      const parsed = normalizeSetDetails(value);
      if (parsed.id !== decodeURIComponent(path.slice(5))) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned a different set.');
    } else if (path.startsWith('ranked-sets-price-v1/')) {
      if (!Array.isArray(value)) throw new CatalogError('INVALID_RESPONSE', 'Invalid saved set prices.');
      const setId = decodeURIComponent(path.slice('ranked-sets-price-v1/'.length));
      const ids = new Set<string>();
      for (const raw of value) {
        const card = normalizeCards(raw, this.language)[0];
        const id = card.catalogIdentity!.id;
        if (card.setId !== setId || ids.has(id)) throw new CatalogError('INVALID_RESPONSE', 'Invalid saved set identity.');
        ids.add(id);
      }
    } else if (path.startsWith('cards/')) {
      const parsed = normalizeCards(value, this.language);
      if (parsed[0].catalogIdentity?.id !== decodeURIComponent(path.slice(6))) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned a different card.');
    } else {
      if (!Array.isArray(value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid card list.');
      value.forEach(normalizeBrief);
    }
  }

  private async readCache(path: string): Promise<Cached | undefined> {
    const memory = this.cache.get(path);
    if (memory) return memory;
    try {
      const saved = await this.options.storage?.getItem(this.key(path));
      if (!saved) return undefined;
      const parsed: unknown = JSON.parse(saved);
      if (!record(parsed) || parsed.version !== 1 || typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)
        || parsed.savedAt > this.now() || !('value' in parsed)) return undefined;
      this.validate(path, parsed.value);
      const entry = { savedAt: parsed.savedAt, value: parsed.value };
      this.remember(path, entry);
      return entry;
    } catch { return undefined; }
  }

  private request(path: string, refresh = false): Promise<Resource> {
    const existing = this.pending.get(path);
    if (existing) return existing;
    const operation = (async (): Promise<Resource> => {
      const cached = await this.readCache(path);
      // Empty searches can become valid as newly released printings arrive.
      const ttl = cached && Array.isArray(cached.value) && cached.value.length === 0 ? Math.min(this.ttl, 60_000) : this.ttl;
      if (!refresh && cached && this.now() - cached.savedAt < ttl) return { value: clone(cached.value), fromCache: true, stale: false, savedAt: cached.savedAt };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new CatalogError('TIMEOUT', 'The catalog request timed out.')); }, this.options.timeoutMs ?? 12000);
        });
        const response = await Promise.race([(this.options.fetch ?? globalThis.fetch)(`${this.base}/${path}`, { signal: controller.signal }), timeout]);
        if (response.status === 404) return { value: null, fromCache: false, stale: false };
        if (!response.ok) throw new CatalogError('HTTP', `The catalog is unavailable (HTTP ${response.status}).`, response.status);
        const value: unknown = await Promise.race([response.json(), timeout]);
        if (value !== null && !record(value) && !Array.isArray(value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid response.');
        this.validate(path, value);
        const entry = { savedAt: this.now(), value };
        this.remember(path, entry);
        try { await this.persist(path, entry); } catch { /* Network results remain usable when the device cache is full. */ }
        return { value: clone(value), fromCache: false, stale: false, savedAt: entry.savedAt };
      } catch (error) {
        if (cached) return { value: clone(cached.value), fromCache: true, stale: true, savedAt: cached.savedAt };
        if (error instanceof CatalogError) throw error;
        throw new CatalogError('NETWORK', 'Could not reach the card catalog. Check your connection and retry.');
      } finally { if (timer) clearTimeout(timer); }
    })();
    this.pending.set(path, operation);
    void operation.finally(() => { this.pending.delete(path); }).catch(() => {});
    return operation;
  }

  private async resource(path: string, signal?: AbortSignal): Promise<Resource> {
    if (signal?.aborted) throw abortError();
    if (!signal) return this.request(path);
    let listener: (() => void) | undefined;
    try {
      return await Promise.race([this.request(path), new Promise<never>((_, reject) => {
        listener = () => reject(abortError());
        signal.addEventListener('abort', listener, { once: true });
      })]);
    } finally { if (listener) signal.removeEventListener('abort', listener); }
  }

  private publish(cards: Card[]): Card[] {
    this.options.onCards?.(clone(cards));
    return clone(cards).map(card => {
      card.prices?.forEach(Object.freeze);
      if (card.marketPrice) Object.freeze(card.marketPrice);
      return card;
    });
  }

  async listSets(): Promise<CatalogSet[]> {
    // /sets briefs omit releaseDate. Ask the server to sort the complete records
    // before projection, rather than downloading hundreds of set details or guessing from IDs.
    const result = await this.resource('sets?sort:field=releaseDate&sort:order=DESC');
    if (!Array.isArray(result.value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid set list.');
    return result.value.map(normalizeSet);
  }

  /** A catalog miss can refresh its small index once/minute, never on every frame. */
  async refreshRecognitionIndex(setIds: string[] = []): Promise<CatalogSet[]> {
    if (this.now() - this.recognitionRefreshAt < 60_000) return this.listSets();
    this.recognitionRefreshAt = this.now();
    const [result] = await Promise.all(['sets?sort:field=releaseDate&sort:order=DESC',
      ...[...new Set(setIds)].slice(0, 4).map(id => `sets/${encodeURIComponent(id)}`)].map(path => this.request(path, true)));
    if (!Array.isArray(result.value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid set list.');
    return result.value.map(normalizeSet);
  }

  async getSet(id: string): Promise<CatalogSetDetails | undefined> {
    const result = await this.resource(`sets/${encodeURIComponent(id)}`);
    return result.value === null ? undefined : normalizeSetDetails(result.value);
  }

  async getCard(id: string): Promise<Card | undefined> {
    const identity = parseCollectibleId(id, this.language);
    const result = await this.resource(`cards/${encodeURIComponent(identity.id)}`);
    if (result.value === null) return undefined;
    const cards = this.publish(normalizeCards(result.value, this.language));
    const selected = identity.variant ? cards.find(card => card.catalogIdentity?.variant === identity.variant) : cards[0];
    if (result.stale) {
      const error = new CatalogError('NETWORK', 'Could not refresh this card. Showing the saved printing.');
      error.cachedCard = selected; error.cachedCards = cards;
      throw error;
    }
    return selected;
  }

  async getVariants(id: string): Promise<Card[]> {
    const identity = parseCollectibleId(id, this.language);
    const result = await this.resource(`cards/${encodeURIComponent(identity.id)}`);
    const cards = result.value === null ? [] : this.publish(normalizeCards(result.value, this.language));
    if (result.stale) {
      const error = new CatalogError('NETWORK', 'Could not refresh this card. Showing the saved printing.');
      error.cachedCards = cards; error.cachedCard = cards.find(card => card.catalogIdentity?.variant === identity.variant) ?? cards[0];
      throw error;
    }
    return cards;
  }

  async listCards(): Promise<Card[]> { return (await this.queryCards()).cards; }
  async searchCards(query: string): Promise<Card[]> { return (await this.queryCards({ query })).cards; }

  private async setPrices(set: CatalogSetDetails, matching: typeof set.cards, query: CatalogQuery): Promise<Resource> {
    const path = `ranked-sets-price-v1/${encodeURIComponent(set.id)}`;
    const cached = await this.readCache(path);
    if (query.signal?.aborted) throw abortError();
    const currentIds = new Set(set.cards.map(card => card.id));
    // A changed printing index invalidates a complete-set ranking, even within its TTL.
    const reusable = cached && Array.isArray(cached.value) && cached.value.length === currentIds.size
      && cached.value.every(raw => record(raw) && typeof raw.id === 'string' && currentIds.has(raw.id)) ? cached : undefined;
    if (reusable && this.now() - reusable.savedAt < this.ttl) {
      return { value: clone(reusable.value), fromCache: true, stale: false };
    }
    const values: unknown[] = [];
    let fromCache = false;
    let stale = false;
    let oldestQuote = this.now();
    query.onProgress?.({ loaded: 0, total: matching.length });
    try {
      // Rank the entire matching index BEFORE slicing into pages. Six requests at
      // a time, with cancellation between groups; a stationary UI never starts a global crawl.
      for (let start = 0; start < matching.length; start += 6) {
        if (query.signal?.aborted) throw abortError();
        const group = await Promise.all(matching.slice(start, start + 6).map(brief => this.resource(`cards/${encodeURIComponent(brief.id)}`, query.signal)));
        for (const detail of group) {
          if (!record(detail.value)) throw new CatalogError('INVALID_RESPONSE', 'A printing in this set could not be loaded. Please retry.');
          const card = normalizeCards(detail.value, this.language)[0];
          if (card.setId !== set.id) throw new CatalogError('INVALID_RESPONSE', 'This printing belongs to a different set.');
          // Compact raw payloads keep a complete ranking available after per-card
          // LRU eviction and across restarts, without persisting unrelated card text.
          const { id, localId, name, image, variants, pricing, set: cardSet } = detail.value;
          values.push({ id, localId, name, image, variants, pricing, set: cardSet });
          fromCache ||= detail.fromCache;
          stale ||= detail.stale;
          oldestQuote = Math.min(oldestQuote, detail.savedAt ?? oldestQuote);
        }
        if (query.signal?.aborted) throw abortError();
        query.onProgress?.({ loaded: values.length, total: matching.length });
      }
    } catch (error) {
      if (query.signal?.aborted) throw abortError();
      if (reusable) return { value: clone(reusable.value), fromCache: true, stale: true };
      throw error;
    }
    if (query.signal?.aborted) throw abortError();
    if (matching.length === currentIds.size && !stale) {
      const entry = { savedAt: oldestQuote, value: values };
      this.remember(path, entry);
      try { await this.persist(path, entry); } catch { /* Full cache does not hide successfully loaded prices. */ }
    }
    return { value: values, fromCache, stale };
  }

  private async querySetCards(query: CatalogQuery, page: number, pageSize: number): Promise<CatalogPage> {
    const result = await this.resource(`sets/${encodeURIComponent(query.setId!)}`, query.signal);
    if (result.value === null) throw new CatalogError('HTTP', 'This expansion is not available. Try another set.', 404);
    const set = normalizeSetDetails(result.value);
    const matching = orderedSetCards(set, query);
    const prices = matching.length ? await this.setPrices(set, matching, query) : { value: [], fromCache: result.fromCache, stale: result.stale };
    // A large set can evict its own index during hydration. Keep the index and
    // complete ranking together so pagination and cold offline reopening work.
    if (matching.length === set.cards.length && result.savedAt !== undefined) {
      const path = `sets/${encodeURIComponent(set.id)}`;
      const entry = { value: result.value, savedAt: result.savedAt };
      this.remember(path, entry);
      try { await this.persist(path, entry); } catch { /* The in-memory index remains usable. */ }
    }
    const ids = new Set(matching.map(card => card.id));
    const ranked = (prices.value as unknown[]).map(raw => priceRepresentative(normalizeCards(raw, this.language)))
      .filter(card => ids.has(card.catalogIdentity!.id)).sort(compareCardPrices);
    const cards = ranked.slice((page - 1) * pageSize, page * pageSize);
    return { cards: this.publish(cards), page, total: matching.length, hasMore: page * pageSize < matching.length,
      set: normalizeSet(result.value), fromCache: result.fromCache || prices.fromCache, stale: result.stale || prices.stale };
  }

  async queryCards(query: CatalogQuery = {}): Promise<CatalogPage> {
    if (query.signal?.aborted) throw abortError();
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize ?? 24)));
    if (!Number.isFinite(page) || !Number.isFinite(pageSize)) throw new Error('Invalid catalog page.');
    if (query.setId) return this.querySetCards(query, page, pageSize);
    const text = (query.collectorNumber ?? query.query ?? '').trim();
    const fraction = text.match(/^(.*?)\s*([a-z]*\d+[a-z]*)\s*\/\s*(\d+)$/i);
    const numberOnly = text.match(/^(?:\d+[a-z]*|(?:TG|GG|SV|RC|SH|SM|SWSH|XY|BW|DP|HGSS)\d+[a-z]*)$/i);
    const parsedLocalId = fraction?.[2] ?? (query.collectorNumber || numberOnly ? text : undefined);
    // Official eq: comparisons are case-sensitive, including promo identifiers.
    const localId = parsedLocalId?.toUpperCase();
    const name = query.collectorNumber ? (query.query ?? '').trim() : fraction ? fraction[1].trim() : localId ? '' : text;
    let setIds = query.setId ? [query.setId] : [];
    const prerequisites: Resource[] = [];
    if (fraction) {
      const denominator = Number(fraction[3]);
      const setResult = await this.resource('sets', query.signal);
      prerequisites.push(setResult);
      if (!Array.isArray(setResult.value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid set list.');
      const sets = setResult.value.map(normalizeSet);
      setIds = sets.filter(set => (!query.setId || set.id === query.setId) && set.cardCount?.official === denominator).map(set => set.id);
      if (!setIds.length) return { cards: [], page, hasMore: false, total: 0, fromCache: setResult.fromCache, stale: setResult.stale };
    }
    const paths: string[] = [];
    const take = (page + 1) * pageSize;
    const addPath = (setId?: string, setName = false, numberValue = localId) => {
      const params = new URLSearchParams({ 'sort:field': 'id', 'sort:order': 'ASC' });
      if (setId) params.set('set.id', `eq:${setId}`);
      if (numberValue) params.set('localId', `eq:${numberValue}`);
      if (name) params.set(setName ? 'set.name' : 'name', name);
      paths.push(`cards?${params.toString()}`);
    };
    const ids: (string | undefined)[] = setIds.length ? setIds : [undefined];
    for (const id of ids) {
      addPath(id);
      if (localId && /^0+\d+$/.test(localId)) addPath(id, false, String(Number(localId)));
      if (name && !fraction) addPath(id, true);
    }
    const lists: Resource[] = [];
    let activePaths = [...new Set(paths)];
    for (let sourcePage = 1; sourcePage <= page + 1 && activePaths.length; sourcePage++) {
      const nextPaths: string[] = [];
      for (let start = 0; start < activePaths.length; start += 6) {
        const groupPaths = activePaths.slice(start, start + 6);
        const group = await Promise.all(groupPaths.map(path => this.resource(`${path}&pagination:page=${sourcePage}&pagination:itemsPerPage=${pageSize}`, query.signal)));
        group.forEach((result, index) => {
          if (!Array.isArray(result.value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid card list.');
          lists.push(result);
          if (result.value.length === pageSize) nextPaths.push(groupPaths[index]);
        });
      }
      activePaths = nextPaths;
    }
    const briefs = new Map<string, ReturnType<typeof normalizeBrief>>();
    for (const result of lists) {
      if (!Array.isArray(result.value)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid card list.');
      for (const row of result.value) { const brief = normalizeBrief(row); briefs.set(brief.id, brief); }
    }
    const sorted = [...briefs.values()].sort((a, b) => a.id.localeCompare(b.id));
    const selected = sorted.slice((page - 1) * pageSize, page * pageSize);
    const details: Resource[] = [];
    const cards: Card[] = [];
    // Bound requests on mobile rather than flooding the provider for every result.
    for (let start = 0; start < selected.length; start += 6) {
      const group = await Promise.all(selected.slice(start, start + 6).map(brief => this.resource(`cards/${encodeURIComponent(brief.id)}`, query.signal)));
      details.push(...group);
      for (const detail of group) if (detail.value !== null) cards.push(normalizeCards(detail.value, this.language)[0]);
    }
    const resources = [...prerequisites, ...lists, ...details];
    return { cards: this.publish(cards), page, hasMore: sorted.length > page * pageSize,
      ...(sorted.length < take ? { total: sorted.length } : {}),
      fromCache: resources.some(resource => resource.fromCache), stale: resources.some(resource => resource.stale) };
  }
}
