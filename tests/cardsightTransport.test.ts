/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardSightTransport, normalizeCardSightIdentification } from '../server/cardsightTransport';
import { createScannerProxy } from '../server/cardsightProxy';
import { CardSightRecognitionService } from '../src/services/cardsight/client';
import { resolveCardSightCandidates } from '../src/services/cardsight/resolve';
import { TcgDexCatalogService } from '../src/services/tcgdex';
import { appendRecognition, createScanSession, editSessionVariant, restoreScanSession, saveScanItems, sessionSummary, updateSessionPrice } from '../src/services/scanSession';
import { initialState, normalizeStoredState } from '../src/services/domain';
import { registerCatalogCard } from '../src/data/catalogRegistry';

// Synthetic values following the supplied CardSight OpenAPI, NOT recorded vendor responses.
const id = '550e8400-e29b-41d4-a716-446655440000';
const alternativeId = '550e8400-e29b-41d4-a716-446655440001';
const parallel = { id: alternativeId, name: 'Normal', confidence: 'High' };
const card = { id, name: 'Pikachu', number: '035/108', setName: 'Base Set', releaseName: 'Evolutions',
  fields: [{ key: 'CARD_LANGUAGE', value: 'en' }], parallelSuggestions: [parallel] };
const payload = (change: Record<string, unknown> = {}, confidence = 'High') => ({ success: true, requestId: 'vendor-request', detectedCount: 1, identifiedCount: 1,
  detections: [{ confidence, card: { ...card, ...change } }] });
const bytes = Uint8Array.from([255, 216, 255, 224, 0, 16, 255, 217]);
const image = { mimeType: 'image/jpeg' as const, base64: Buffer.from(bytes).toString('base64'), width: 600, height: 840 };
const token = 'integration_pairing_token_for_tests_1234';
const vendorKey = 'fixture_vendor_key_must_never_reach_mobile';
const date = '2026-10-19T12:00:00Z';

function catalog() {
  const raw = { id: 'xy12-35', name: 'Pikachu', localId: '35', set: { id: 'xy12', name: 'Evolutions', cardCount: { official: 108, total: 113 } },
    variants: { normal: true, reverse: true },
    pricing: { tcgplayer: { unit: 'USD', updated: date, normal: { marketPrice: 1.25 }, 'reverse-holofoil': { marketPrice: 4.2 } } } };
  return new TcgDexCatalogService({ onCards: cards => { cards.forEach(registerCatalogCard); }, fetch: async input => {
    const path = new URL(String(input)).pathname.replace('/v2/en/', '');
    if (path === 'sets') return Response.json([{ id: 'xy12', name: 'Evolutions' }]);
    if (path === 'sets/xy12') return Response.json({ id: 'xy12', name: 'Evolutions', cards: [raw] });
    if (path === 'cards/xy12-35') return Response.json(raw);
    throw new Error('Unexpected catalog call');
  } });
}

test('verified transport posts binary JPEG and server-only key to the fixed HTTPS endpoint exactly once', async () => {
  const signal = new AbortController().signal; let calls = 0;
  const result = await cardSightTransport(bytes, { apiKey: vendorKey, signal, fetch: async (url, init) => {
    calls++; assert.equal(url, 'https://api.cardsight.ai/v1/identify/card'); assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error'); assert.equal(init?.signal, signal); assert.deepEqual(init?.body, bytes);
    assert.deepEqual(init?.headers, { 'X-API-Key': vendorKey, 'Content-Type': 'image/jpeg', Accept: 'application/json' });
    return Response.json({ ...payload(), messages: [{ type: 'info', message: vendorKey }] });
  } });
  assert.equal(calls, 1); assert.equal(result.candidates[0].providerId, id);
  assert.equal(result.candidates[0].confidenceTier, 'High'); assert.equal(result.candidates[0].confidence, undefined);
  assert.deepEqual(result.candidates[0].setNames, ['Base Set', 'Evolutions']);
  assert.equal(JSON.stringify(result).includes(vendorKey), false);
});

test('no detected/exact card yields no match; set-only and unidentified slab records never invent a printing', () => {
  assert.deepEqual(normalizeCardSightIdentification({ success: false, requestId: 'x', detectedCount: 0 }), { candidates: [] });
  for (const partial of [{}, { setName: 'Evolutions', setId: id }, { name: 'Pikachu', number: '35', setName: 'Evolutions' }]) {
    assert.deepEqual(normalizeCardSightIdentification(payload({ ...partial, id: undefined, name: partial.name, number: partial.number })), { candidates: [] });
  }
});

test('several physical detections require a recoverable one-card retry, never alternative printing selection', () => {
  for (const value of [{ ...payload(), detectedCount: 2 }, { ...payload(), detections: [...payload().detections, ...payload().detections] }]) {
    assert.throws(() => normalizeCardSightIdentification(value), { code: 'multiple_cards' });
  }
});

test('known language is preserved, absent or conflicting evidence stays undetermined', () => {
  assert.equal(normalizeCardSightIdentification(payload({ fields: [{ key: 'CARD_LANGUAGE', value: 'ja' }] })).candidates[0].language, 'ja');
  for (const fields of [undefined, [], [{ key: 'CARD_LANGUAGE', value: 'en' }, { key: 'CARD_LANGUAGE', value: 'ja' }]]) {
    assert.equal(normalizeCardSightIdentification(payload({ fields })).candidates[0].language, 'und');
  }
});

test('finishes require one supported High-confidence parallel; ranking, rarity and print runs cannot infer a finish', () => {
  for (const [name, expected] of [['Normal', 'normal'], ['Holofoil', 'holo'], ['Reverse Holofoil', 'reverse']]) {
    assert.equal(normalizeCardSightIdentification(payload({ parallelSuggestions: [{ ...parallel, name }] })).candidates[0].finish, expected);
  }
  for (const change of [{ parallelSuggestions: undefined }, { parallelSuggestions: [] },
    { parallelSuggestions: [parallel, { ...parallel, name: 'Reverse Holofoil' }] },
    { parallelSuggestions: [{ ...parallel, confidence: 'Low' }] }, { parallelSuggestions: [{ ...parallel, confidence: undefined }] },
    { parallelSuggestions: [{ ...parallel, name: 'Gold' }] }, { parallelSuggestions: [{ ...parallel, numberedTo: 25 }] },
    { numberedTo: 25 }, { parallelSuggestions: [{ ...parallel, isPartial: true, cards: [alternativeId] }] },
    { parallelSuggestions: undefined, attributes: ['Holo'], description: 'Holofoil' }]) {
    assert.equal(normalizeCardSightIdentification(payload(change)).candidates[0].finish, 'unknown');
  }
});

test('Medium/Low suggestions are full alternative printing records with no invented finish or exact confidence', async () => {
  const parsed = normalizeCardSightIdentification(payload({ suggestions: [{ ...card, id: alternativeId, number: '36' }] }, 'Medium'));
  assert.equal(parsed.candidates.length, 2); assert.equal(parsed.candidates[1].confidenceTier, 'Medium');
  assert.equal(parsed.candidates[1].confidence, undefined); assert.equal(parsed.candidates[1].finish, 'unknown');
  const source = catalog();
  await assert.rejects(resolveCardSightCandidates(parsed, source), { code: 'AMBIGUOUS' });
  const confirmed = await resolveCardSightCandidates(parsed, source, { chooseCandidate: async choices => choices[0] });
  assert.equal(confirmed.ambiguity, 'confirmed'); assert.equal(confirmed.marketPrice?.amount, 1.25);
});

test('High evidence maps exact release metadata to English TCGdex without borrowing provider UUIDs or a print-run denominator', async () => {
  const result = await resolveCardSightCandidates(normalizeCardSightIdentification(payload()), catalog());
  assert.equal(result.id, 'tcgdex:en:xy12-35:normal'); assert.equal(result.confidenceTier, 'High');
  assert.equal(result.confidence, undefined); assert.equal(result.ambiguity, 'confirmed');
  const numbered = await resolveCardSightCandidates(normalizeCardSightIdentification(payload({ numberedTo: 25 })), catalog());
  assert.equal(numbered.marketPrice, null); assert.equal(numbered.ambiguity, 'review');
  const mismatched = normalizeCardSightIdentification(payload({ number: '35/999' }));
  await assert.rejects(resolveCardSightCandidates(mismatched, catalog()), { code: 'CATALOG_UNRESOLVED' });
});

test('missing language requires deliberate English printing confirmation; explicit Japanese never silently becomes English', async () => {
  const response = normalizeCardSightIdentification(payload({ fields: undefined }));
  await assert.rejects(resolveCardSightCandidates(response, catalog()), { code: 'AMBIGUOUS' });
  let reviews = 0;
  const result = await resolveCardSightCandidates(response, catalog(), { chooseCandidate: async cards => { reviews++; return cards[0]; } });
  assert.equal(reviews, 1); assert.equal(result.ambiguity, 'confirmed');
  await assert.rejects(resolveCardSightCandidates(normalizeCardSightIdentification(payload({ fields: [{ key: 'CARD_LANGUAGE', value: 'ja' }] })), catalog()), { code: 'CATALOG_UNRESOLVED' });
});

test('malformed successful responses fail validation rather than pretending to be a recognized card', () => {
  for (const malformed of [{}, { ...payload(), success: 'true' }, { ...payload(), requestId: null }, { ...payload(), detectedCount: -1 },
    { ...payload(), success: false }, { ...payload(), detections: [{}] }, payload({}, '95%'),
    payload({ id: 'not-a-uuid' }), payload({ number: 35 }), payload({ fields: 'en' }),
    payload({ parallelSuggestions: [{ ...parallel, confidence: 0.99 }] }), payload({ suggestions: [{}], number: 123 })]) {
    assert.throws(() => normalizeCardSightIdentification(malformed), { code: 'provider_response' });
  }
});

test('provider HTTP failures are sanitized and never retried automatically', async () => {
  for (const [status, code] of [[400, 'provider_rejected'], [401, 'provider_auth'], [403, 'provider_auth'], [404, 'provider_unavailable'],
    [408, 'provider_unavailable'], [429, 'provider_rate_limited'], [500, 'provider_unavailable'], [503, 'provider_unavailable']]) {
    let calls = 0;
    await assert.rejects(cardSightTransport(bytes, { apiKey: vendorKey, signal: new AbortController().signal, fetch: async () => {
      calls++; return Response.json({ error: vendorKey, code: 'UPSTREAM_ERROR' }, { status: Number(status) });
    } }), (error: unknown) => error instanceof Error && 'code' in error && error.code === code && !error.message.includes(vendorKey));
    assert.equal(calls, 1);
  }
});

test('bounded response reading rejects HTML, malformed JSON and oversized chunked or declared bodies', async () => {
  let canceled = false;
  const oversized = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(512 * 1024 + 1)); }, cancel() { canceled = true; } }), { headers: { 'Content-Type': 'application/json' } });
  for (const response of [new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(512 * 1024 + 1) } }), oversized()]) {
    await assert.rejects(cardSightTransport(bytes, { apiKey: vendorKey, signal: new AbortController().signal, fetch: async () => response }), { code: 'provider_response' });
  }
  assert.equal(canceled, true);
});

test('actual adapter + authenticated proxy + client + TCGdex + Organize keep staging and replay-safe Collection saves separate', async () => {
  let vendorCalls = 0;
  const handler = createScannerProxy({ apiKey: vendorKey, devToken: token, transport: cardSightTransport, minIntervalMs: 0,
    fetch: async () => { vendorCalls++; return Response.json(payload()); } });
  const client = new CardSightRecognitionService({ proxyUrl: 'http://scanner.test', token, catalog: catalog(),
    fetch: async (url, init) => {
      assert.equal(String(init?.body).includes(vendorKey), false);
      const response = await handler(new Request(url, init));
      assert.equal((await response.clone().text()).includes(vendorKey), false);
      return response;
    } });
  const recognized = await client.recognize({ image });
  const state = { ...initialState, items: [], trial: { successfulRecognitions: 0 as const } };
  let session = appendRecognition(createScanSession('real-session'), recognized, 'scan-one', date, true, recognized.ambiguity, recognized.confidence);
  session = updateSessionPrice(session, recognized.id, recognized.marketPrice);
  assert.equal(vendorCalls, 1); assert.equal(sessionSummary(session).value, 1.25); assert.equal(state.items.length, 0);
  session = restoreScanSession(JSON.parse(JSON.stringify(session)), 'fallback');
  const saved = saveScanItems(state, session.items);
  assert.equal(saved.state.items[0].cardId, recognized.id); assert.equal(saved.state.items[0].quantity, 1);
  const retried = saveScanItems(normalizeStoredState(JSON.parse(JSON.stringify(saved.state))), session.items);
  assert.equal(retried.state.items[0].quantity, 1); assert.equal(retried.result.errors.length, 0);
});

test('no parallel evidence stages unpriced review and requires Organize finish confirmation before saving', async () => {
  const recognized = await resolveCardSightCandidates(normalizeCardSightIdentification(payload({ parallelSuggestions: undefined })), catalog());
  let session = appendRecognition(createScanSession('review-session'), recognized, 'review-one', date, false, recognized.ambiguity);
  const state = { ...initialState, items: [] };
  assert.equal(sessionSummary(session).unpriced, 1);
  assert.equal(saveScanItems(state, session.items).result.savedOperationIds.length, 0);
  session = editSessionVariant(session, 'review-one', 'tcgdex:en:xy12-35:reverse', 'confirmed-variant');
  assert.equal(session.items[0].price, null);
  assert.equal(saveScanItems(state, session.items).result.errors.length, 0);
  assert.equal(session.items[0].cardId, 'tcgdex:en:xy12-35:reverse');
});

test('real transport respects proxy timeout/abort and idempotent request receipts', async () => {
  let calls = 0; let aborted = false;
  const handler = createScannerProxy({ apiKey: vendorKey, devToken: token, transport: cardSightTransport, minIntervalMs: 0, timeoutMs: 10,
    fetch: async (_url, init) => { calls++; init?.signal?.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); } });
  const request = () => new Request('http://scanner.test/recognize', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'retry-receipt', image: { base64: image.base64, mimeType: image.mimeType } }) });
  assert.equal((await handler(request())).status, 504); assert.equal(aborted, true);
  assert.equal((await handler(request())).status, 504); assert.equal(calls, 1);
});
