import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogError, TcgDexCatalogService, type CatalogStorage } from '../src/services/tcgdex';

const prefix = 'chase.tcgdex.v1:en:';
const updatedAt = '2026-10-01T00:00:00.000Z';
const raw = (id = 'base1-4', amount = 1) => ({ id, name: 'Charizard', localId: id.split('-')[1],
  set: { id: 'base1', name: 'Base Set', cardCount: { official: 102, total: 102 } },
  variants: { normal: false, holo: true, reverse: false },
  pricing: { tcgplayer: { unit: 'USD', updated: updatedAt, holofoil: { marketPrice: amount } } } });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
};
async function bounded<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), 500);
  })]); } finally { if (timer) clearTimeout(timer); }
}
async function until(check: () => boolean) {
  await bounded((async () => { while (!check()) await new Promise(resolve => setTimeout(resolve, 2)); })(), 'Cache writer did not complete.');
}

test('a hung optional cache read cannot stop this or subsequent catalog lookups', async () => {
  let reads = 0; let requests = 0; let writes = 0;
  const storage: CatalogStorage = {
    getItem: async () => { reads++; return new Promise<string | null>(() => {}); },
    setItem: async () => { writes++; },
  };
  const service = new TcgDexCatalogService({ storage, cacheIoTimeoutMs: 10, fetch: async input => {
    requests++; return Response.json(raw(decodeURIComponent(new URL(String(input)).pathname.split('/').at(-1)!)));
  } });
  const first = await bounded(service.getCard('base1-4'), 'The first cache read held recognition indefinitely.');
  const second = await bounded(service.getCard('base1-5'), 'A hung cache poisoned the next lookup.');
  assert.equal(first?.id, 'tcgdex:en:base1-4:holo');
  assert.equal(second?.id, 'tcgdex:en:base1-5:holo');
  assert.equal(first.marketPrice?.amount, 1);
  assert.equal(requests, 2); assert.equal(reads, 1); assert.equal(writes, 0);
});

test('a hung cache write releases shared network requests and retains exact in-memory printings', async () => {
  let requests = 0; let writes = 0;
  const storage: CatalogStorage = {
    getItem: async () => null,
    setItem: async () => { writes++; return new Promise<void>(() => {}); },
  };
  const service = new TcgDexCatalogService({ storage, cacheIoTimeoutMs: 10, fetch: async () => { requests++; return Response.json(raw()); } });
  const [first, duplicate] = await bounded(Promise.all([service.getCard('base1-4'), service.getCard('base1-4')]), 'A cache write held a successful identification.');
  assert.equal(first?.id, duplicate?.id); assert.equal(requests, 1);
  const next = await bounded(service.getVariants('base1-4'), 'A completed catalog request stayed busy.');
  assert.equal(next[0].id, 'tcgdex:en:base1-4:holo'); assert.equal(next[0].marketPrice?.amount, 1);
  assert.equal(requests, 1); assert.equal(writes, 1);
});

test('slow best-effort writes never hold fresh quotes and remain serialized so older data cannot overwrite newer data', async () => {
  const values = new Map<string, string>();
  const firstWrite = deferred<void>();
  let releases = 0; let activeWrites = 0; let peakWrites = 0; let amount = 1;
  const storage: CatalogStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key === prefix + 'cards/base1-4') {
        activeWrites++; peakWrites = Math.max(peakWrites, activeWrites);
        if (releases++ === 0) await firstWrite.promise;
        values.set(key, value); activeWrites--;
      } else values.set(key, value);
    },
  };
  const service = new TcgDexCatalogService({ storage, cacheIoTimeoutMs: 1000, cacheTtlMs: 0,
    fetch: async () => Response.json(raw('base1-4', amount)) });
  const old = await bounded(service.getCard('base1-4'), 'Optional storage delayed the first quote.');
  assert.equal(old?.marketPrice?.amount, 1);
  amount = 2;
  const fresh = await bounded(service.getCard('base1-4'), 'Queued optional storage delayed the refreshed quote.');
  assert.equal(fresh?.marketPrice?.amount, 2);
  assert.equal(releases, 1, 'The newer native write waits for the older write to settle.');
  firstWrite.resolve();
  await until(() => releases === 2 && activeWrites === 0);
  const stored = JSON.parse(values.get(prefix + 'cards/base1-4')!);
  assert.equal(stored.value.pricing.tcgplayer.holofoil.marketPrice, 2);
  assert.equal(peakWrites, 1);
});

test('timed-out native writes cannot resume index updates or delete valid cached data after finishing late', async () => {
  const values = new Map<string, string>([[prefix + 'cache-index', JSON.stringify(['cards/preserved'])], [prefix + 'cards/preserved', 'keep']]);
  const oldWrite = deferred<void>();
  const writes: string[] = []; const removed: string[] = [];
  let amount = 1;
  const storage: CatalogStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); await oldWrite.promise; values.set(key, value); },
    removeItem: async key => { removed.push(key); values.delete(key); },
  };
  const service = new TcgDexCatalogService({ storage, cacheIoTimeoutMs: 10, cacheTtlMs: 0, maxCacheEntries: 1,
    fetch: async () => Response.json(raw('base1-4', amount)) });
  assert.equal((await bounded(service.getCard('base1-4'), 'Timed-out write did not release the first response.'))?.marketPrice?.amount, 1);
  amount = 2;
  assert.equal((await bounded(service.getCard('base1-4'), 'Timed-out write blocked refreshed data.'))?.marketPrice?.amount, 2);
  oldWrite.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, [prefix + 'cards/base1-4'], 'No newer native write overlaps the timed-out call.');
  assert.deepEqual(removed, []); assert.equal(values.get(prefix + 'cards/preserved'), 'keep');
  assert.equal((await service.getCard('base1-4'))?.marketPrice?.amount, 2, 'Late cache work cannot roll back current in-memory data.');
});

test('a delayed cache read is discarded after timeout rather than rolling back a fresh API result', async () => {
  const oldRead = deferred<string | null>();
  let reads = 0; let requests = 0;
  const storage: CatalogStorage = { getItem: async () => { reads++; return oldRead.promise; }, setItem: async () => {} };
  const service = new TcgDexCatalogService({ storage, cacheIoTimeoutMs: 10, fetch: async () => { requests++; return Response.json(raw('base1-4', 2)); } });
  assert.equal((await bounded(service.getCard('base1-4'), 'The delayed read held fresh data.'))?.marketPrice?.amount, 2);
  oldRead.resolve(JSON.stringify({ version: 1, savedAt: Date.now(), value: raw('base1-4', 1) }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await service.getCard('base1-4'))?.marketPrice?.amount, 2);
  assert.equal(requests, 1); assert.equal(reads, 1);
});

test('canceling one search during a hung cache read does not poison another caller sharing the same request', async () => {
  let reads = 0; let requests = 0;
  const storage: CatalogStorage = { getItem: async () => { reads++; return new Promise<string | null>(() => {}); }, setItem: async () => {} };
  const service = new TcgDexCatalogService({ storage, cacheIoTimeoutMs: 10, fetch: async () => { requests++; return Response.json([]); } });
  const controller = new AbortController();
  const canceled = service.queryCards({ signal: controller.signal });
  const other = service.queryCards();
  controller.abort();
  await assert.rejects(canceled, error => error instanceof CatalogError && error.code === 'ABORTED');
  assert.deepEqual((await bounded(other, 'The canceled caller poisoned its shared catalog request.')).cards, []);
  assert.deepEqual((await service.queryCards()).cards, []);
  assert.equal(requests, 1); assert.equal(reads, 1);
});
