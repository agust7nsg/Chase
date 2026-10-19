/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { CardSightRecognitionService } from '../src/services/cardsight/client';
import { resolveCardSightCandidates, type RecognitionCatalog } from '../src/services/cardsight/resolve';
import { CardSightError, parseCardSightRecognitionResponse, type CardSightCandidate } from '../src/services/cardsight/types';
import { TcgDexCatalogService } from '../src/services/tcgdex';
import type { Card } from '../src/types/domain';

const candidate: CardSightCandidate = { providerId: 'vendor-opaque-123', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108', language: 'en', finish: 'normal', confidence: 0.98 };
const image = { base64: '/9j/aGVsbG8=', mimeType: 'image/jpeg' as const, width: 600, height: 840 };
const raw = (id = 'xy12-35', name = 'Pikachu', localId = '35') => ({ id, name, localId,
  set: { id: 'xy12', name: 'Evolutions', cardCount: { official: 108, total: 113 } },
  variants: { normal: true, reverse: true },
  pricing: { tcgplayer: { unit: 'USD', updated: '2026-10-01T00:00:00Z', normal: { marketPrice: 1.25 }, 'reverse-holofoil': { marketPrice: 4.2 } } } });

function catalog(cards = [raw()]) {
  const requests: string[] = [];
  const service = new TcgDexCatalogService({ fetch: async input => {
    const path = new URL(String(input)).pathname.replace('/v2/en/', ''); requests.push(path);
    if (path === 'sets') return Response.json([{ id: 'xy12', name: 'Evolutions' }]);
    if (path === 'sets/xy12') return Response.json({ id: 'xy12', name: 'Evolutions', cards });
    if (path.startsWith('cards/')) { const card = cards.find(card => card.id === path.slice(6)); return card ? Response.json(card) : new Response('', { status: 404 }); }
    throw new Error(`Unexpected request ${path}`);
  } });
  return { service, requests };
}

test('Chase proxy protocol validates normalized fields and strips arbitrary upstream values', () => {
  const parsed = parseCardSightRecognitionResponse({ candidates: [{ ...candidate, privateKey: 'never-forward', rawImage: 'never-forward' }], vendor: 'never-forward' });
  assert.deepEqual(parsed, { candidates: [candidate] });
  assert.deepEqual(parseCardSightRecognitionResponse({ candidates: [] }), { candidates: [] });
  for (const invalid of [{}, { ...candidate, confidence: 95 }, { ...candidate, confidence: NaN }, { ...candidate, finish: 'foil' },
    { ...candidate, tcgdexId: 'tcgdex:en:xy12-35:normal' }, { ...candidate, language: 'EN' }, { ...candidate, collectorNumber: '' }]) {
    assert.equal(parseCardSightRecognitionResponse({ candidates: [invalid] }), undefined);
  }
  assert.equal(parseCardSightRecognitionResponse({ candidates: Array.from({ length: 13 }, () => candidate) }), undefined);
});

test('recognition resolves exact catalog printing and finish, independently from opaque provider identity', async () => {
  const source = catalog();
  const normal = await resolveCardSightCandidates({ candidates: [candidate] }, source.service);
  assert.equal(normal.id, 'tcgdex:en:xy12-35:normal');
  assert.equal(normal.marketPrice?.amount, 1.25); assert.equal(normal.ambiguity, 'confirmed');
  const reverse = await resolveCardSightCandidates({ candidates: [{ ...candidate, finish: 'reverse' }] }, source.service);
  assert.equal(reverse.id, 'tcgdex:en:xy12-35:reverse'); assert.equal(reverse.marketPrice?.amount, 4.2);
  assert.deepEqual(source.requests, ['sets', 'sets/xy12', 'cards/xy12-35'], 'resolver uses set index rather than full-set price-ranked search');
});

test('optional canonical ID still requires exact set, name, number, denominator and language', async () => {
  const source = catalog();
  const direct = await resolveCardSightCandidates({ candidates: [{ ...candidate, tcgdexId: 'xy12-35', collectorNumber: '035/108' }] }, source.service);
  assert.equal(direct.id, 'tcgdex:en:xy12-35:normal');
  for (const mismatch of [{ name: 'Pikachu ex' }, { setName: 'Base Set' }, { collectorNumber: '35/102' }, { collectorNumber: '36' }, { language: 'ja' }]) {
    await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, tcgdexId: 'xy12-35', ...mismatch }] }, source.service), { code: 'CATALOG_UNRESOLVED' });
  }
});

test('unknown finish remains reviewable and unpriced, unsupported requested finish never borrows a quote', async () => {
  const source = catalog();
  for (const finish of ['unknown', undefined] as const) {
    const result = await resolveCardSightCandidates({ candidates: [{ ...candidate, finish }] }, source.service);
    assert.equal(result.marketPrice, null); assert.deepEqual(result.prices, []); assert.equal(result.ambiguity, 'review');
    assert.equal(result.availableVariants?.length, 2);
  }
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, finish: 'holo' }] }, source.service), { code: 'CATALOG_UNRESOLVED' });
});

test('no match and ambiguous printings recover without taking first candidate or inventing a catalog match', async () => {
  const source = catalog([raw(), raw('xy12-36', 'Pikachu', '36')]);
  await assert.rejects(resolveCardSightCandidates({ candidates: [] }, source.service), { code: 'NO_MATCH' });
  const response = { candidates: [candidate, { ...candidate, providerId: 'second', collectorNumber: '36/108' }] };
  await assert.rejects(resolveCardSightCandidates(response, source.service), { code: 'AMBIGUOUS' });
  const result = await resolveCardSightCandidates(response, source.service, { chooseCandidate: async cards => cards[1] });
  assert.equal(result.id, 'tcgdex:en:xy12-36:normal');
  await assert.rejects(resolveCardSightCandidates(response, source.service, { chooseCandidate: async () => ({ id: 'wrong' } as Card) }), { code: 'AMBIGUOUS' });
});

test('duplicate candidates merge but English-only resolution never translates an unsupported language', async () => {
  const source = catalog();
  const result = await resolveCardSightCandidates({ candidates: [candidate, { ...candidate, confidence: 0.4 }] }, source.service);
  assert.equal(result.confidence, 0.98);
  const noCatalog: RecognitionCatalog = { listSets: async () => { throw new Error('must not query English catalog'); }, getSet: async () => undefined, getVariants: async () => [] };
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, language: 'ja' }] }, noCatalog), { code: 'CATALOG_UNRESOLVED' });
});

test('client posts ephemeral image only to authenticated Chase proxy and returns real catalog identity', async () => {
  const source = catalog(); let calls = 0;
  const service = new CardSightRecognitionService({ proxyUrl: 'http://192.168.1.2:8787/', token: 'dev-only-token', catalog: source.service,
    fetch: async (url, init) => {
      calls++; assert.equal(url, 'http://192.168.1.2:8787/recognize'); assert.equal(init?.method, 'POST');
      assert.deepEqual(init?.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer dev-only-token' });
      const body = JSON.parse(String(init?.body)); assert.ok(body.requestId); assert.deepEqual(body.image, { base64: image.base64, mimeType: image.mimeType });
      assert.equal(JSON.stringify(body).includes('CARDSIGHT_API_KEY'), false);
      return Response.json({ candidates: [candidate] });
    } });
  const result = await service.recognize({ image });
  assert.equal(result.id, 'tcgdex:en:xy12-35:normal'); assert.equal(calls, 1);
  await assert.rejects(service.recognize(), { code: 'IMAGE_REQUIRED' }); assert.equal(calls, 1);
});

test('client rejects raw vendor payloads, sanitizes proxy errors and does not automatically retry failures', async () => {
  const source = catalog(); let calls = 0;
  const errors = [Response.json({ predictions: [{ card: 'Pikachu' }] }), Response.json({ error: { code: 'provider_contract_pending', message: 'secret' } }, { status: 503 }),
    Response.json({ error: { code: 'rate_limited', message: 'secret' } }, { status: 429 })];
  const service = new CardSightRecognitionService({ proxyUrl: 'http://localhost:8787', token: 'dev', catalog: source.service,
    fetch: async () => { calls++; return errors.shift()!; } });
  await assert.rejects(service.recognize({ image }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(service.recognize({ image }), (error: unknown) => error instanceof CardSightError && error.code === 'PROVIDER_UNAVAILABLE' && !error.message.includes('secret'));
  await assert.rejects(service.recognize({ image }), { code: 'RATE_LIMITED' }); assert.equal(calls, 3);
});

test('recognition deadline, cancellation, and single-flight release resources for manual retry', async () => {
  const source = catalog(); let calls = 0; let aborted = false;
  const service = new CardSightRecognitionService({ proxyUrl: 'http://localhost:8787', token: 'dev', catalog: source.service, timeoutMs: 10,
    fetch: async (_url, init) => { calls++; init?.signal?.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); } });
  const first = service.recognize({ image });
  await assert.rejects(service.recognize({ image }), { code: 'BUSY' });
  await assert.rejects(first, { code: 'TIMEOUT' }); assert.equal(aborted, true); assert.equal(calls, 1);
  const controller = new AbortController(); const second = service.recognize({ image, signal: controller.signal }); controller.abort();
  await assert.rejects(second, { code: 'ABORTED' }); assert.equal(calls, 2);
  await assert.rejects(service.recognize({ image, signal: controller.signal }), { code: 'ABORTED' }); assert.equal(calls, 2);
});

test('catalog cancellation remains immediate without waiting for a shared catalog request to finish', async () => {
  const controller = new AbortController();
  const stalled: RecognitionCatalog = { listSets: async () => new Promise(() => {}), getSet: async () => undefined, getVariants: async () => [] };
  const pending = resolveCardSightCandidates({ candidates: [candidate] }, stalled, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { code: 'ABORTED' });
});

test('low-confidence single printing requires deliberate review and exact finish can be confirmed afterward', async () => {
  const source = catalog();
  const low = { candidates: [{ ...candidate, confidence: 0.4 }] };
  await assert.rejects(resolveCardSightCandidates(low, source.service), { code: 'AMBIGUOUS' });
  let reviews = 0;
  const confirmed = await resolveCardSightCandidates(low, source.service, { chooseCandidate: async cards => { reviews++; return cards[0]; } });
  assert.equal(reviews, 1); assert.equal(confirmed.ambiguity, 'confirmed'); assert.equal(confirmed.confidence, 0.4);
  const unknown = await resolveCardSightCandidates({ candidates: [{ ...candidate, finish: 'unknown', confidence: 0.4 }] }, source.service,
    { chooseCandidate: async cards => cards[0] });
  assert.equal(unknown.ambiguity, 'review'); assert.equal(unknown.marketPrice, null);
});

test('valid identification survives missing price and review cancellation never commits a choice', async () => {
  const unpriced = raw(); delete (unpriced as { pricing?: unknown }).pricing;
  const source = catalog([unpriced]);
  const result = await resolveCardSightCandidates({ candidates: [candidate] }, source.service);
  assert.equal(result.id, 'tcgdex:en:xy12-35:normal'); assert.equal(result.marketPrice, null); assert.equal(result.ambiguity, 'confirmed');
  const controller = new AbortController();
  const pending = resolveCardSightCandidates({ candidates: [{ ...candidate, confidence: 0.3 }] }, source.service,
    { signal: controller.signal, chooseCandidate: async () => { controller.abort(); return new Promise(() => {}); } });
  await assert.rejects(pending, { code: 'ABORTED' });
});
