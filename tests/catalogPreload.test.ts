import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogPreloader, preloadDelay, prefetchCatalogImages, type PreloadCatalog } from '../src/services/catalogPreload';
import type { Card } from '../src/types/domain';
const card = { imageUrl: 'https://assets.tcgdex.net/en/xy/xy12/1/high.webp' } as Card;
test('preload completes newest sets and all pages before advancing, without restarting completed work', async () => {
  const calls: string[] = [], images: string[][] = [];
  const catalog: PreloadCatalog = { listSets: async () => [{ id: 'new', name: 'Newest' }, { id: 'old', name: 'Oldest' }], queryCards: async query => {
    assert.equal(query.background, true); calls.push(`${query.setId}:${query.page}`); await query.beforeBatch?.();
    return { cards: [card], page: query.page!, hasMore: query.setId === 'new' && query.page === 1, stale: false, fromCache: false };
  } };
  const worker = new CatalogPreloader(catalog, async urls => { images.push(urls); }, async () => {});
  await worker.run(new AbortController().signal); await worker.run(new AbortController().signal);
  assert.deepEqual(calls, ['new:1', 'new:2', 'old:1']); assert.equal(images.length, 3);
});
test('foreground cancellation starts no next set or image batch and resumes unfinished sets later', async () => {
  const controller = new AbortController(); let queries = 0, imageCalls = 0;
  const worker = new CatalogPreloader({ listSets: async () => [{ id: 'new', name: 'New' }, { id: 'old', name: 'Old' }], queryCards: async query => {
    queries++; if (queries === 1) controller.abort();
    return { cards: [card], page: query.page!, hasMore: false, stale: false, fromCache: false };
  } }, async () => { imageCalls++; }, async () => {});
  await worker.run(controller.signal); assert.equal(queries, 1); assert.equal(imageCalls, 0);
  await worker.run(new AbortController().signal); assert.equal(queries, 3); assert.equal(imageCalls, 2);
});
test('offline/stale data backs off instead of crawling every historical set', async () => {
  let calls = 0;
  const worker = new CatalogPreloader({ listSets: async () => [{ id: 'new', name: 'New' }, { id: 'old', name: 'Old' }], queryCards: async () => {
    calls++; return { cards: [], page: 1, hasMore: false, stale: true, fromCache: true };
  } }, async () => {}, async () => {});
  await worker.run(new AbortController().signal); assert.equal(calls, 1);
});
test('a concurrent launch cannot duplicate a download pass', async () => {
  let release!: () => void, calls = 0;
  const worker = new CatalogPreloader({ listSets: async () => { calls++; await new Promise<void>(resolve => { release = resolve; }); return []; }, queryCards: async () => { throw new Error('Unused'); } }, async () => {}, async () => {});
  const first = worker.run(new AbortController().signal); await worker.run(new AbortController().signal); release(); await first; assert.equal(calls, 1);
});
test('disk artwork warming follows same-printing encoding fallbacks', async () => {
  const calls: string[] = [];
  await prefetchCatalogImages([card.imageUrl!], new AbortController().signal, async url => { calls.push(url); return url.endsWith('high.png'); });
  assert.deepEqual(calls, [card.imageUrl, card.imageUrl!.replace('webp', 'png')]);
});
test('a hung image prefetch releases on navigation and starts no later batch or fallback', async () => {
  const controller = new AbortController(); let calls = 0;
  const promise = prefetchCatalogImages(Array(30).fill(card.imageUrl), controller.signal, async () => { calls++; return new Promise<boolean>(() => {}); });
  setTimeout(() => controller.abort(), 140);
  await assert.rejects(promise); assert.equal(calls, 3);
});
test('a timed out image group does not accumulate an unbounded download queue', async () => {
  let calls = 0;
  await assert.rejects(prefetchCatalogImages(Array(30).fill(card.imageUrl), new AbortController().signal, async () => { calls++; return new Promise<boolean>(() => {}); }, 5));
  assert.equal(calls, 3);
});
test('preload pacing cancels promptly', async () => {
  const controller = new AbortController(); const waiting = preloadDelay(controller.signal, 10000); controller.abort(); await assert.rejects(waiting);
});
