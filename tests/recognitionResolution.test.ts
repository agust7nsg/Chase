import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCardSightCandidates, type RecognitionCatalog } from '../src/services/cardsight/resolve';
import { CardSightError, CatalogResolutionError, type CardSightCandidate } from '../src/services/cardsight/types';
import { RecognitionLinks } from '../src/services/cardsight/links';
import { TcgDexCatalogService } from '../src/services/tcgdex';
import { normalizeCards } from '../src/services/tcgdex/normalize';

// Controlled metadata for the reported Greninja number. This is not a captured vendor response.
const candidate: CardSightCandidate = { providerId: 'cardsight-greninja', providerSetId: 'vendor-anniversary', name: 'Greninja ex',
  setName: '30th Celebration', collectorNumber: '021/120', language: 'en', finish: 'unknown', confidenceTier: 'High' };
const raw = (variants: Record<string, boolean> = { holo: true }) => ({ id: '30th-021', name: 'Greninja ex', localId: '021',
  set: { id: '30th', name: '30th Celebration', cardCount: { official: 120, total: 128 } }, variants,
  pricing: { tcgplayer: { unit: 'USD', updated: '2026-10-19T00:00:00Z', holofoil: { marketPrice: 12.5 }, 'reverse-holofoil': { marketPrice: 9 } } } });
function catalog(variants: Record<string, boolean> = { holo: true }): RecognitionCatalog {
  return { listSets: async () => [{ id: '30th', name: '30th Celebration' }],
    getSet: async () => ({ id: '30th', name: '30th Celebration', cards: [{ id: '30th-021', name: 'Greninja ex', localId: '021' }] }),
    getVariants: async () => normalizeCards(raw(variants), 'en') };
}

test('a sole known finish is inferred without redundant Holo confirmation and retains its exact quote', async () => {
  const result = await resolveCardSightCandidates({ candidates: [candidate] }, catalog());
  assert.equal(result.id, 'tcgdex:en:30th-021:holo'); assert.equal(result.ambiguity, 'confirmed');
  assert.equal(result.marketPrice?.amount, 12.5); assert.equal(result.marketPrice?.variantId, 'holo');
});

test('multiple finishes, unspecified catalog flags and conflicting parallel evidence remain unpriced review', async () => {
  for (const [source, input] of [[catalog({ holo: true, reverse: true }), candidate], [catalog({}), candidate],
    [catalog(), { ...candidate, finishReviewRequired: true }]] as const) {
    const result = await resolveCardSightCandidates({ candidates: [input] }, source);
    assert.equal(result.ambiguity, 'review'); assert.equal(result.marketPrice, null); assert.deepEqual(result.prices, []);
  }
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, finish: 'reverse' }] }, catalog()), CatalogResolutionError);
});

test('a unique finish does not bypass language/printing confirmation', async () => {
  for (const change of [{ language: 'und' }, { confidenceTier: 'Low' as const }]) {
    const response = { candidates: [{ ...candidate, ...change }] };
    await assert.rejects(resolveCardSightCandidates(response, catalog()), { code: 'AMBIGUOUS' });
    const result = await resolveCardSightCandidates(response, catalog(), { chooseCandidate: async cards => cards[0] });
    assert.equal(result.ambiguity, 'confirmed'); assert.equal(result.marketPrice?.amount, 12.5);
  }
});

test('a cached expansion index refresh discovers a new set once instead of staying stale for a day', async () => {
  let listCalls = 0;
  const source = new TcgDexCatalogService({ fetch: async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/sets')) return Response.json(++listCalls === 1 ? [{ id: 'base1', name: 'Base Set' }]
      : [{ id: 'base1', name: 'Base Set' }, { id: '30th', name: '30th Celebration' }]);
    if (path.endsWith('/sets/30th')) return Response.json({ id: '30th', name: '30th Celebration', cards: [raw()] });
    if (path.endsWith('/cards/30th-021')) return Response.json(raw());
    throw new Error('Unexpected path');
  } });
  await source.listSets();
  const result = await resolveCardSightCandidates({ candidates: [candidate] }, source);
  assert.equal(result.ambiguity, 'confirmed'); assert.equal(listCalls, 2);
  await source.refreshRecognitionIndex(); await source.refreshRecognitionIndex(); assert.equal(listCalls, 2);
});

test('a different provider expansion label can use bounded name+number lookup, with deliberate printing confirmation', async () => {
  let queries = 0; let reviews = 0;
  const source = catalog(); source.queryCards = async (query = {}) => {
    queries++; assert.equal(query.query, 'Greninja ex'); assert.equal(query.collectorNumber, '021');
    assert.equal(query.pageSize, 12);
    return { cards: normalizeCards(raw(), 'en'), page: 1, hasMore: false, fromCache: false, stale: false };
  };
  const response = { candidates: [{ ...candidate, setName: 'Vendor anniversary release' }] };
  await assert.rejects(resolveCardSightCandidates(response, source), { code: 'AMBIGUOUS' });
  const result = await resolveCardSightCandidates(response, source, { chooseCandidate: async cards => { reviews++; return cards[0]; } });
  assert.equal(reviews, 1); assert.equal(queries, 2); assert.equal(result.catalogIdentity?.id, '30th-021');
});

test('fallback never silently crosses the collector denominator or translates a Japanese printing', async () => {
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, setName: '2026 30th Celebration' }] }, catalog()), CatalogResolutionError,
    'A year in an expansion label cannot be silently stripped as if it were an unrelated display prefix.');
  const source = catalog(); let queries = 0;
  source.queryCards = async () => { queries++; return { cards: normalizeCards(raw(), 'en'), page: 1, hasMore: false, fromCache: false, stale: false }; };
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, collectorNumber: '021/999' }] }, source), CatalogResolutionError);
  const count = queries;
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, language: 'ja' }] }, source), (cause: unknown) => cause instanceof CatalogResolutionError && cause.diagnostics.stage === 'language');
  assert.equal(queries, count);
});

test('manual cross-provider links survive reload and safely resolve provider naming/numbering differences', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  const mismatched = { ...candidate, setName: 'Provider different label', name: 'Greninja', collectorNumber: '21/128' };
  const card = normalizeCards(raw(), 'en')[0];
  await new RecognitionLinks(storage).remember(mismatched, card);
  const links = new RecognitionLinks(storage);
  const result = await resolveCardSightCandidates({ candidates: [mismatched] }, catalog(), { links });
  assert.equal(result.id, card.id); assert.equal(result.collectorNumber, '021/120');
  assert.equal(await links.lookup({ ...mismatched, providerSetId: 'another-set' }), undefined);
  assert.equal(await links.lookup({ ...mismatched, language: 'ja' }), undefined);
});

test('catalog downtime retains the provider identity and a diagnostic stage without inventing a price', async () => {
  const source = catalog(); source.listSets = async () => { throw new Error('offline'); };
  await assert.rejects(resolveCardSightCandidates({ candidates: [candidate] }, source), (cause: unknown) => {
    assert.ok(cause instanceof CatalogResolutionError); assert.equal(cause.code, 'CATALOG_UNRESOLVED');
    assert.equal(cause.recognition.candidates[0].providerId, candidate.providerId); assert.equal(cause.diagnostics.stage, 'network');
    return true;
  });
  assert.equal(new CardSightError('CONFIGURATION', 'key').recovery, 'manual');
});

test('optional link-cache failures cannot prevent an otherwise valid printing identification', async () => {
  const links = new RecognitionLinks({ getItem: async () => { throw new Error('cache read failed'); }, setItem: async () => {} });
  const result = await resolveCardSightCandidates({ candidates: [candidate] }, catalog(), { links });
  assert.equal(result.id, 'tcgdex:en:30th-021:holo');
});

test('numeric lookup tolerates provider omission of leading zeroes without changing the printing denominator', async () => {
  const calls: string[] = []; const source = catalog();
  source.queryCards = async (query = {}) => {
    calls.push(query.collectorNumber!);
    return { cards: query.collectorNumber === '021' ? normalizeCards(raw(), 'en') : [], page: 1, hasMore: false, fromCache: false, stale: false };
  };
  const result = await resolveCardSightCandidates({ candidates: [{ ...candidate, setName: 'Provider alias', collectorNumber: '21/120' }] }, source,
    { chooseCandidate: async cards => cards[0] });
  assert.deepEqual(calls, ['21', '021']); assert.equal(result.collectorNumber, '021/120');
});

test('negative cached card searches refresh after a minute, retaining full-day caching for known data', async () => {
  let now = 1000; let calls = 0; let available = false;
  const source = new TcgDexCatalogService({ now: () => now, fetch: async input => {
    const url = new URL(String(input)); calls++;
    if (url.pathname.endsWith('/cards')) return Response.json(available ? [{ id: '30th-021', name: 'Greninja ex', localId: '021' }] : []);
    if (url.pathname.endsWith('/cards/30th-021')) return Response.json(raw());
    throw new Error('Unexpected request');
  } });
  assert.equal((await source.queryCards({ query: 'Greninja ex' })).cards.length, 0);
  const initial = calls; available = true; now += 30_000;
  assert.equal((await source.queryCards({ query: 'Greninja ex' })).cards.length, 0); assert.equal(calls, initial);
  now += 31_000;
  assert.equal((await source.queryCards({ query: 'Greninja ex' })).cards.length, 1); assert.ok(calls > initial);
});
