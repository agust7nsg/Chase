/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogError, TcgDexCatalogService, type CatalogStorage } from '../src/services/tcgdex';
import type { Card } from '../src/types/domain';

const updated = '2026-10-01T00:00:00.000Z';
const sets = [
  { id: 'xy12', name: 'Evolutions', cardCount: { official: 108, total: 113 } },
  { id: 'base1', name: 'Base Set', cardCount: { official: 102, total: 102 } },
];
function raw(id = 'xy12-35', name = 'Pikachu', localId = '35', set = sets[0]) {
  return { id, name, localId, set, image: `https://assets.tcgdex.net/en/xy/${set.id}/${localId}`,
    variants: { normal: true, holo: false, reverse: true, firstEdition: false, wPromo: false },
    pricing: {
      tcgplayer: { unit: 'USD', updated, normal: { marketPrice: 1.25, midPrice: 999 }, 'reverse-holofoil': { marketPrice: 4.2 } },
      cardmarket: { unit: 'EUR', updated, avg: 0.99, trend: 1.1, 'avg-holo': 3.2, 'trend-holo': 3.5, reverseHoloSell: 777 },
    } };
}
function fixture(cards: ReturnType<typeof raw>[] = [raw()]) {
  const requests: URL[] = [];
  let offline = false;
  let corrupt = false;
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    requests.push(url);
    if (offline) throw new TypeError('offline');
    if (corrupt) return Response.json({ id: 'wrong', name: 'wrong' });
    const path = decodeURIComponent(url.pathname.replace('/v2/en/', ''));
    if (path === 'sets') return Response.json(sets);
    if (path.startsWith('sets/')) {
      const set = sets.find(row => row.id === path.slice(5));
      return set ? Response.json({ ...set, cards: cards.filter(card => card.set.id === set.id), releaseDate: '2016-11-02' }) : new Response('', { status: 404 });
    }
    if (path.startsWith('cards/')) {
      const card = cards.find(row => row.id === path.slice(6));
      return card ? Response.json(card) : new Response('', { status: 404 });
    }
    if (path === 'cards') {
      const filter = (key: string) => (url.searchParams.get(key) ?? '').replace(/^eq:/, '').toLowerCase();
      const matches = cards.filter(card => (!filter('name') || card.name.toLowerCase().includes(filter('name')))
        && (!filter('localId') || card.localId.toLowerCase() === filter('localId'))
        && (!filter('set.id') || card.set.id === filter('set.id'))
        && (!filter('set.name') || card.set.name.toLowerCase().includes(filter('set.name')))).sort((a, b) => a.id.localeCompare(b.id));
      const page = Number(url.searchParams.get('pagination:page'));
      const size = Number(url.searchParams.get('pagination:itemsPerPage'));
      return Response.json(matches.slice((page - 1) * size, page * size).map(({ id, localId, name, image }) => ({ id, localId, name, image })));
    }
    throw new Error(`Unexpected fixture endpoint ${path}`);
  };
  return { requests, fetch: fetcher, offline: () => { offline = true; }, corrupt: () => { corrupt = true; } };
}
function memoryStorage() {
  const values = new Map<string, string>();
  const storage: CatalogStorage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  return { storage, values };
}

test('real printing identities keep finishes separate and preserve exact quote provenance', async () => {
  const source = fixture();
  const published: Card[] = [];
  const service = new TcgDexCatalogService({ fetch: source.fetch, onCards: cards => { published.push(...cards); } });
  const normal = await service.getCard('xy12-35');
  assert.equal(normal?.id, 'tcgdex:en:xy12-35:normal');
  assert.equal(normal?.collectorNumber, '35/108');
  assert.equal(normal?.imageUrl, 'https://assets.tcgdex.net/en/xy/xy12/35/high.webp');
  assert.deepEqual(normal?.catalogIdentity, { provider: 'tcgdex', language: 'en', id: 'xy12-35', variant: 'normal' });
  assert.deepEqual(normal?.marketPrice, { amount: 1.25, currency: 'USD', source: 'tcgplayer', updatedAt: updated,
    variant: 'Normal', variantId: 'normal', metric: 'marketPrice', market: 'US', kind: 'raw' });
  assert.equal(normal?.prices?.length, 2, 'documented non-foil Cardmarket group is assigned to the sole non-foil finish');
  assert.equal(normal?.prices?.[1].amount, 1.1);
  assert.equal(normal?.prices?.[1].metric, 'trend');
  assert.equal(Object.isFrozen(normal?.marketPrice), true);
  assert.equal(Object.isFrozen(normal?.prices?.[0]), true);
  const reverse = await service.getCard('tcgdex:en:xy12-35:reverse');
  assert.equal(reverse?.marketPrice?.amount, 4.2);
  assert.equal(reverse?.prices?.length, 2, 'sole foil finish can use the documented foil group');
  assert.equal(reverse?.prices?.[1].amount, 3.5);
  assert.equal(reverse?.prices?.[1].metric, 'trend-holo');
  assert.equal(reverse?.prices?.[1].currency, 'EUR');
  assert.deepEqual(reverse?.availableVariants?.map(row => row.id), ['tcgdex:en:xy12-35:normal', 'tcgdex:en:xy12-35:reverse']);
  assert.equal(published.length, 4);
  assert.equal(source.requests.length, 1, 'detail requests reuse the same canonical resource');
  assert.equal((await service.getVariants(reverse!.id)).length, 2);
});

test('missing finish prices, invalid dates/units, aggregate quotes, and unknown flags never acquire another finish price', async () => {
  const value = raw();
  value.variants = { normal: true, holo: true, reverse: true, firstEdition: true, wPromo: true };
  delete (value.pricing.tcgplayer as Record<string, unknown>)['reverse-holofoil'];
  value.pricing.tcgplayer.updated = 'not a date';
  value.pricing.cardmarket.unit = 'USD';
  const service = new TcgDexCatalogService({ fetch: fixture([value]).fetch });
  const variants = await service.getVariants(value.id);
  assert.equal(variants.length, 5);
  assert.ok(variants.every(card => card.marketPrice === null && card.prices?.length === 0));
  const unknown = raw('xy12-99', 'Unknown', '99');
  (unknown as { variants?: unknown }).variants = undefined;
  const unpriced = await new TcgDexCatalogService({ fetch: fixture([unknown]).fetch }).getCard(unknown.id);
  assert.equal(unpriced?.variant, 'Unspecified');
  assert.equal(unpriced?.marketPrice, null);
});

test('Cardmarket foil groups stay unassigned when holo/reverse or editions are ambiguous', async () => {
  const both = raw();
  both.variants.holo = true;
  (both.pricing as { tcgplayer?: unknown }).tcgplayer = undefined;
  let variants = await new TcgDexCatalogService({ fetch: fixture([both]).fetch }).getVariants(both.id);
  assert.equal(variants.find(card => card.variant === 'Normal')?.marketPrice?.source, 'cardmarket');
  assert.equal(variants.find(card => card.variant === 'Holo')?.marketPrice, null);
  assert.equal(variants.find(card => card.variant === 'Reverse holo')?.marketPrice, null);
  both.variants.firstEdition = true;
  variants = await new TcgDexCatalogService({ fetch: fixture([both]).fetch }).getVariants(both.id);
  assert.ok(variants.every(card => card.marketPrice === null), 'edition aggregates cannot price any collectible finish');
  const soleHolo = raw();
  soleHolo.variants = { normal: false, holo: true, reverse: false, firstEdition: false, wPromo: false };
  (soleHolo.pricing as { tcgplayer?: unknown }).tcgplayer = undefined;
  const holo = await new TcgDexCatalogService({ fetch: fixture([soleHolo]).fetch }).getCard(soleHolo.id);
  assert.equal(holo?.marketPrice?.source, 'cardmarket');
  assert.equal(holo?.marketPrice?.amount, 3.5);
  assert.equal(holo?.marketPrice?.variantId, 'holo');
});

test('TCGplayer documented reverse alias is exact to reverse and never borrowed by holo', async () => {
  const value = raw();
  value.variants.holo = true;
  const pricing = value.pricing.tcgplayer as Record<string, unknown>;
  delete pricing['reverse-holofoil'];
  pricing.reverse = { marketPrice: 5.6 };
  const variants = await new TcgDexCatalogService({ fetch: fixture([value]).fetch }).getVariants(value.id);
  assert.equal(variants.find(card => card.variant === 'Reverse holo')?.marketPrice?.amount, 5.6);
  assert.equal(variants.find(card => card.variant === 'Holo')?.marketPrice, null);
});

test('catalog searches by name, set, local number, exact fraction and preserves alphanumeric Pokémon names', async () => {
  const source = fixture([raw(), raw('base1-35', 'Porygon2', '35', sets[1]), raw('xy12-TG05', 'Special', 'TG05')]);
  const service = new TcgDexCatalogService({ fetch: source.fetch });
  assert.equal((await service.queryCards({ query: 'Pikachu' })).cards[0].name, 'Pikachu');
  assert.ok((await service.queryCards({ query: 'Evolutions' })).cards.every(card => card.setId === 'xy12'));
  assert.equal((await service.queryCards({ query: '35' })).cards.length, 2);
  const fraction = await service.queryCards({ query: '035/108' });
  assert.deepEqual(fraction.cards.map(card => card.localId), ['35']);
  assert.equal(fraction.cards[0].setId, 'xy12');
  assert.equal((await service.queryCards({ query: 'Porygon2' })).cards[0].name, 'Porygon2');
  assert.deepEqual((await service.queryCards({ collectorNumber: 'TG05' })).cards.map(card => card.localId), ['TG05']);
  assert.equal((await service.getCard('xy12-TG05'))?.collectorNumber, 'TG05');
  assert.deepEqual((await service.queryCards({ query: 'TG05' })).cards.map(card => card.localId), ['TG05']);
  assert.deepEqual((await service.queryCards({ query: 'tg05' })).cards.map(card => card.localId), ['TG05']);
  assert.equal((await service.queryCards({ query: '35/999' })).total, 0);
  assert.deepEqual((await service.getSet('xy12'))?.cards.map(row => row.id), ['xy12-35', 'xy12-TG05']);
  assert.equal(await service.getSet('missing'), undefined);
  assert.equal(await service.getCard('missing'), undefined);
});

test('fixed-size provider pagination and sorted union return every distinct printing once', async () => {
  const source = fixture(Array.from({ length: 57 }, (_, index) => raw(`xy12-${String(index + 1).padStart(3, '0')}`, `Pikachu ${index}`, String(index + 1))));
  const service = new TcgDexCatalogService({ fetch: source.fetch });
  const one = await service.queryCards({ query: 'Pikachu', pageSize: 24 });
  const two = await service.queryCards({ query: 'Pikachu', pageSize: 24, page: 2 });
  const three = await service.queryCards({ query: 'Pikachu', pageSize: 24, page: 3 });
  assert.equal(one.cards.length, 24); assert.equal(one.hasMore, true);
  assert.equal(two.cards.length, 24); assert.equal(two.hasMore, true);
  assert.equal(three.cards.length, 9); assert.equal(three.hasMore, false);
  assert.equal(new Set([...one.cards, ...two.cards, ...three.cards].map(card => card.id)).size, 57);
  const pages = source.requests.filter(url => url.pathname.endsWith('/cards'));
  assert.ok(pages.some(url => url.searchParams.get('pagination:page') === '2'));
  assert.ok(pages.every(url => url.searchParams.get('pagination:itemsPerPage') === '24'));
});

test('cache survives a new service, stale search stays explicit, and stale detail includes a saved snapshot', async () => {
  const backing = memoryStorage();
  let now = 100000;
  const source = fixture();
  const service = new TcgDexCatalogService({ fetch: source.fetch, storage: backing.storage, now: () => now, cacheTtlMs: 100 });
  const original = await service.queryCards();
  assert.equal(original.fromCache, false);
  now += 101;
  source.offline();
  const restarted = new TcgDexCatalogService({ fetch: source.fetch, storage: backing.storage, now: () => now, cacheTtlMs: 100 });
  const cached = await restarted.queryCards();
  assert.equal(cached.fromCache, true); assert.equal(cached.stale, true);
  assert.equal(cached.cards[0].id, original.cards[0].id);
  await assert.rejects(restarted.getCard(original.cards[0].id), error => {
    assert.ok(error instanceof CatalogError);
    assert.equal(error.cachedCard?.id, original.cards[0].id);
    assert.equal(error.cachedCards?.length, 2);
    return true;
  });
});

test('set browsing uses the complete expansion index and paginates by actual collector number', async () => {
  const cards = ['10', '2', '1', '100', '3', 'TG05'].map(number => raw(`xy12-${number}`, `Pikachu ${number}`, number));
  const source = fixture(cards);
  const service = new TcgDexCatalogService({ fetch: source.fetch });
  const one = await service.queryCards({ setId: 'xy12', pageSize: 2 });
  assert.equal(one.total, 6);
  assert.equal(one.hasMore, true);
  assert.deepEqual(one.cards.map(card => card.localId), ['1', '2']);
  assert.equal(one.set?.name, 'Evolutions');
  const two = await service.queryCards({ setId: 'xy12', pageSize: 2, page: 2 });
  const three = await service.queryCards({ setId: 'xy12', pageSize: 2, page: 3 });
  assert.deepEqual([...one.cards, ...two.cards, ...three.cards].map(card => card.localId), ['1', '2', '3', '10', '100', 'TG05']);
  assert.equal(three.hasMore, false);
  assert.equal(new Set([...one.cards, ...two.cards, ...three.cards].map(card => card.id)).size, 6);
  assert.ok(source.requests.every(url => !url.pathname.endsWith('/cards')), 'Unfiltered global pages must not leak into a set.');
  assert.equal(source.requests.filter(url => url.pathname.endsWith('/sets/xy12')).length, 1);
  assert.deepEqual((await service.queryCards({ setId: 'xy12', collectorNumber: 'tg05' })).cards.map(card => card.localId), ['TG05']);
  assert.deepEqual((await service.queryCards({ setId: 'xy12', query: '002/108' })).cards.map(card => card.localId), ['2']);
  assert.equal((await service.queryCards({ setId: 'xy12', query: '2/999' })).total, 0);
  assert.equal((await service.queryCards({ setId: 'xy12', query: 'no card' })).total, 0);
});

test('expansion browsing retains cards without art, recovers offline and never relabels failed lookups as an empty set', async () => {
  const card = raw();
  (card as { image?: string }).image = undefined;
  const source = fixture([card]);
  const backing = memoryStorage();
  let now = 1000;
  const service = new TcgDexCatalogService({ fetch: source.fetch, storage: backing.storage, now: () => now, cacheTtlMs: 10 });
  const first = await service.queryCards({ setId: 'xy12' });
  assert.equal(first.total, 1);
  assert.equal(first.cards[0].imageUrl, undefined);
  now += 20;
  source.offline();
  const offline = await service.queryCards({ setId: 'xy12' });
  assert.equal(offline.stale, true);
  assert.equal(offline.total, 1);
  assert.equal(offline.cards[0].id, first.cards[0].id);
  const fresh = new TcgDexCatalogService({ fetch: fixture().fetch });
  await assert.rejects(fresh.queryCards({ setId: 'missing' }), error => error instanceof CatalogError && error.status === 404);
});

test('concurrent detail requests deduplicate and caller cancellation does not cancel other consumers', async () => {
  const source = fixture();
  const service = new TcgDexCatalogService({ fetch: source.fetch });
  const [normal, variants] = await Promise.all([service.getCard('xy12-35'), service.getVariants('xy12-35')]);
  assert.equal(source.requests.length, 1);
  assert.equal(variants.length, 2);
  normal!.name = 'mutated';
  assert.equal((await service.getCard('xy12-35'))?.name, 'Pikachu');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.queryCards({ signal: controller.signal }), (error: unknown) => error instanceof CatalogError && error.code === 'ABORTED');
});

test('timeouts, HTTP failures and malformed responses fail without poisoning retries or substituting mocks', async () => {
  const hung = new TcgDexCatalogService({ fetch: async () => new Promise<Response>(() => {}), timeoutMs: 5 });
  await assert.rejects(hung.getCard('xy12-35'), (error: unknown) => error instanceof CatalogError && error.code === 'TIMEOUT');
  const denied = new TcgDexCatalogService({ fetch: async () => new Response('', { status: 403 }) });
  await assert.rejects(denied.getCard('base1-4'), (error: unknown) => error instanceof CatalogError && error.status === 403);
  let count = 0;
  const repaired = new TcgDexCatalogService({ fetch: async () => Response.json(++count === 1 ? { invalid: true } : raw()) });
  await assert.rejects(repaired.getCard('xy12-35'), (error: unknown) => error instanceof CatalogError && error.code === 'INVALID_RESPONSE');
  assert.equal((await repaired.getCard('xy12-35'))?.name, 'Pikachu');
  assert.equal(count, 2);
  const mismatch = new TcgDexCatalogService({ fetch: async () => Response.json(raw('xy12-99')) });
  await assert.rejects(mismatch.getCard('xy12-35'), /different card/);
});

test('persistent cache is bounded and corrupt device data is ignored', async () => {
  const backing = memoryStorage();
  backing.values.set('chase.tcgdex.v1:en:cards/xy12-35', JSON.stringify({ version: 1, savedAt: 1, value: { invalid: true } }));
  const source = fixture([raw(), raw('xy12-36', 'Raichu', '36'), raw('xy12-37', 'Zapdos', '37')]);
  const service = new TcgDexCatalogService({ fetch: source.fetch, storage: backing.storage, maxCacheEntries: 2 });
  for (const id of ['xy12-35', 'xy12-36', 'xy12-37']) assert.ok(await service.getCard(id));
  assert.equal(backing.values.size, 3, 'two resources and their bounded index');
  assert.equal(backing.values.has('chase.tcgdex.v1:en:cards/xy12-35'), false);
  assert.equal(source.requests.length, 3);
});
