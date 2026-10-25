/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { CardSightRecognitionService } from '../src/services/cardsight/client';
import { resolveCardSightCandidates, type RecognitionCatalog } from '../src/services/cardsight/resolve';
import { CatalogResolutionError, type CardSightCandidate, type CardSightRecognitionResponse } from '../src/services/cardsight/types';
import { normalizeCards } from '../src/services/tcgdex/normalize';
import { appendRecognition, createScanSession, linkPendingRecognition, restoreScanSession, saveScanItems, sessionSummary } from '../src/services/scanSession';
import { deferHeldRecognition, editPendingQuantity, stagePendingRecognition } from '../src/services/pendingRecognition';
import { initialState, normalizeStoredState } from '../src/services/domain';
import { clearRemoteCatalog } from '../src/data/catalogRegistry';
import { heldPendingIncludesPrinting, reviewHeldPrinting } from '../src/services/scannerIdentity';

const raw = (id: string, localId: string) => ({ id, localId, name: 'Pikachu',
  set: { id: 'xy12', name: 'Evolutions', cardCount: { official: 108 } },
  variants: { normal: true, reverse: true }, image: `https://assets.tcgdex.net/en/xy/xy12/${localId}`,
  pricing: { tcgplayer: { unit: 'USD', updated: '2026-10-01T00:00:00Z', normal: { marketPrice: 1.25 }, 'reverse-holofoil': { marketPrice: 4.2 } } } });
const cards = [raw('xy12-35', '35'), raw('xy12-36', '36')];
const catalog: RecognitionCatalog = {
  listSets: async () => [{ id: 'xy12', name: 'Evolutions' }],
  getSet: async () => ({ id: 'xy12', name: 'Evolutions', cards: cards.map(card => ({ id: card.id, name: card.name, localId: card.localId })) }),
  getVariants: async id => cards.filter(card => card.id === id).flatMap(card => normalizeCards(card, 'en')),
};
const candidate: CardSightCandidate = { providerId: 'first', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108', language: 'en', finish: 'normal', confidence: 0.98 };
const response: CardSightRecognitionResponse = { candidates: [candidate, { ...candidate, providerId: 'second', collectorNumber: '36/108', confidence: 0.6 }] };
const date = '2026-10-25T00:00:00Z';
async function deferred(value = response): Promise<CatalogResolutionError> {
  let chosen = false;
  try {
    await resolveCardSightCandidates(value, catalog, { deferReview: true, chooseCandidate: async () => { chosen = true; throw new Error('must not interrupt camera'); } });
    assert.fail('uncertain printings must remain pending');
  } catch (cause) {
    assert.equal(chosen, false);
    assert.ok(cause instanceof CatalogResolutionError);
    return cause;
  }
}

test('live deferral never opens a chooser or silently confirms a candidate; all exact finishes retain artwork', async () => {
  const pending = await deferred();
  assert.equal(pending.reviewChoices?.length, 4);
  assert.equal(pending.reviewChoices[0].id, 'tcgdex:en:xy12-35:normal');
  assert.deepEqual(new Set(pending.reviewChoices.map(card => card.id)), new Set(['tcgdex:en:xy12-35:normal', 'tcgdex:en:xy12-35:reverse', 'tcgdex:en:xy12-36:normal', 'tcgdex:en:xy12-36:reverse']));
  assert.ok(pending.reviewChoices.every(card => card.imageUrl && card.marketPrice === null && card.prices?.length === 0));
  assert.equal(pending.recognition.candidates[1].confidence, 0.6);
});

test('low confidence and unknown language defer to Organize while exact identity and finish-only review stay uninterrupted', async () => {
  for (const change of [{ confidence: 0.4 }, { confidence: undefined, confidenceTier: 'Medium' as const }, { language: 'und' }]) {
    assert.ok((await deferred({ candidates: [{ ...candidate, ...change }] })).reviewChoices?.length);
  }
  const known = await resolveCardSightCandidates({ candidates: [candidate] }, catalog, { deferReview: true });
  assert.equal(known.ambiguity, 'confirmed'); assert.equal(known.marketPrice?.amount, 1.25);
  const finish = await resolveCardSightCandidates({ candidates: [{ ...candidate, finish: 'unknown' }] }, catalog, { deferReview: true });
  assert.equal(finish.ambiguity, 'review'); assert.equal(finish.marketPrice, null);
  const conflicting = await deferred({ candidates: [{ ...candidate, finish: 'holo' }] });
  assert.equal(conflicting.reviewChoices?.length, 2, 'a conflicting finish keeps exact printing artwork for review rather than inventing Holo');
  assert.ok(conflicting.reviewChoices.every(card => card.variant !== 'Holo' && card.marketPrice === null));
  await assert.rejects(resolveCardSightCandidates({ candidates: [{ ...candidate, language: 'ja' }] }, catalog, { deferReview: true }),
    (cause: unknown) => cause instanceof CatalogResolutionError && cause.reviewChoices === undefined);
});

test('deferred choices survive a cold process without prices or extra payload fields, and confirmation saves only the chosen finish', async () => {
  const error = await deferred();
  const dirty = error.reviewChoices!.map(card => ({ ...card, base64: 'never-store-camera', rawResponse: 'never-store-vendor' }));
  let session = stagePendingRecognition(createScanSession('deferred'), error.recognition, error.diagnostics, 'pending-one', date, dirty);
  session = editPendingQuantity(session, 'pending-one', 3);
  const encoded = JSON.stringify(session); assert.equal(encoded.includes('never-store'), false);
  clearRemoteCatalog();
  const restored = restoreScanSession(JSON.parse(encoded), 'fallback');
  assert.equal(restored.unresolved?.[0].reviewChoices?.length, 4);
  assert.deepEqual(sessionSummary(restored), { copies: 3, value: 0, unpriced: 3 });
  assert.equal(saveScanItems(initialState, restored.items).result.savedOperationIds.length, 0);
  const reverse = restored.unresolved![0].reviewChoices!.find(card => card.id === 'tcgdex:en:xy12-36:reverse')!;
  const linked = linkPendingRecognition(restored, 'pending-one', reverse, 'selected-reverse', false, 'confirmed');
  assert.equal(linked.unresolved?.length, 0); assert.equal(linked.items[0].cardId, reverse.id); assert.equal(linked.items[0].quantity, 3);
  assert.equal(linked.items[0].price, null, 'an offline confirmation cannot invent its exact quote');
  const saved = saveScanItems(initialState, linked.items);
  assert.equal(saved.state.items[0].cardId, reverse.id);
  const retry = saveScanItems(normalizeStoredState(JSON.parse(JSON.stringify(saved.state))), linked.items);
  assert.equal(retry.state.items[0].quantity, 3);
});

test('a Free deferred recognition spends the trial once yet permits its own later review without opening another allowance', async () => {
  const error = await deferred();
  const session = stagePendingRecognition(createScanSession('free'), error.recognition, error.diagnostics, 'free-pending', date, error.reviewChoices, true);
  assert.equal(session.freeRecognitionUsed, true); assert.equal(session.unresolved![0].freeRecognitionRecorded, true);
  const restored = restoreScanSession(JSON.parse(JSON.stringify(session)), 'fallback');
  assert.equal(restored.freeRecognitionUsed, true);
  assert.throws(() => stagePendingRecognition(restored, response, error.diagnostics, 'another', date, error.reviewChoices, true), /free scan/);
  const linked = linkPendingRecognition(restored, 'free-pending', restored.unresolved![0].reviewChoices![0], 'finish-free', true, 'confirmed');
  assert.equal(linked.items.length, 1); assert.equal(linked.freeRecognitionUsed, true);
  const other = stagePendingRecognition(linked, response, error.diagnostics, 'another-pending', date, error.reviewChoices);
  assert.throws(() => linkPendingRecognition(other, 'another-pending', error.reviewChoices![0], 'another-confirm', true, 'confirmed'), /free scan/);
  assert.throws(() => restoreScanSession({ ...session, unresolved: [{ ...session.unresolved![0], reviewChoices: [{ ...error.reviewChoices![0], id: 'different-id' }] }] }, 'fallback'));
});

test('the recognition client releases its request immediately for deferred review instead of awaiting a camera modal', async () => {
  let requests = 0; let chooserCalls = 0;
  const service = new CardSightRecognitionService({ proxyUrl: 'http://localhost:8787', token: 'local-fixture-only', catalog,
    fetch: async () => { requests++; return Response.json(response); } });
  const image = { base64: '/9j/aGVsbG8=', mimeType: 'image/jpeg' as const, width: 600, height: 840 };
  for (let scan = 0; scan < 2; scan++) {
    await assert.rejects(service.recognize({ image, deferReview: true, chooseCandidate: async cards => { chooserCalls++; return cards[0]; } }),
      (cause: unknown) => cause instanceof CatalogResolutionError && cause.reviewChoices?.length === 4);
  }
  assert.equal(chooserCalls, 0); assert.equal(requests, 2);
});

test('a held printing re-observed with uncertain evidence becomes reviewable without another physical copy or price', () => {
  const card = normalizeCards(raw('xy12-35', '35'), 'en')[0];
  const session = appendRecognition(createScanSession('held'), card, 'one', date, false);
  const reviewed = reviewHeldPrinting(session, card.id);
  assert.equal(sessionSummary(reviewed).copies, 1);
  assert.equal(reviewed.items[0].ambiguity, 'review');
  assert.equal(reviewed.items[0].price, null); assert.equal(reviewed.items[0].card?.marketPrice, null);
  assert.equal(reviewHeldPrinting(reviewed, card.id), reviewed, 'repeated observations are idempotent');
  assert.equal(reviewHeldPrinting(reviewed, 'not-a-held-printing'), reviewed);
});

test('ambiguous held-card verification transfers one unsaved copy, preserving alternatives and replay-safe partial saves', async () => {
  const error = await deferred();
  const card = normalizeCards(raw('xy12-35', '35'), 'en')[0];
  let before = appendRecognition(createScanSession('ambiguous-held'), card, 'held-one', date, false);
  before = appendRecognition(before, card, 'held-two', date, false);
  const transferred = deferHeldRecognition(before, card.id, error.recognition, error.diagnostics, 'uncertain-copy', date,
    error.reviewChoices!, 'remaining-operation');
  assert.equal(sessionSummary(transferred).copies, 2);
  assert.equal(transferred.items[0].quantity, 1); assert.equal(transferred.items[0].operationId, 'remaining-operation');
  assert.equal(transferred.unresolved?.[0].quantity, 1); assert.equal(transferred.unresolved?.[0].reviewChoices?.length, 4);
  assert.equal(heldPendingIncludesPrinting(transferred, 'pending:uncertain-copy', card.id), true);
  assert.equal(heldPendingIncludesPrinting(transferred, 'pending:uncertain-copy', 'tcgdex:en:xy12-35:reverse'), true);
  assert.equal(heldPendingIncludesPrinting(transferred, 'pending:uncertain-copy', 'tcgdex:en:another-printing:normal'), false);
  assert.equal(heldPendingIncludesPrinting(transferred, 'pending:another-row', card.id), false);
  assert.equal(deferHeldRecognition(createScanSession('already-saved'), card.id, error.recognition, error.diagnostics, 'none', date,
    error.reviewChoices!, 'none-left').unresolved, undefined, 'saved ownership is never recreated by appearance verification');
  const savedRemaining = saveScanItems(initialState, transferred.items);
  const cleaned = { ...transferred, items: transferred.items.filter(item => !savedRemaining.result.savedOperationIds.includes(item.operationId)) };
  const other = transferred.unresolved![0].reviewChoices!.find(choice => choice.id === 'tcgdex:en:xy12-36:reverse')!;
  const confirmed = linkPendingRecognition(cleaned, 'uncertain-copy', other, 'confirmed-other', false, 'confirmed');
  const savedOther = saveScanItems(savedRemaining.state, confirmed.items);
  assert.equal(savedOther.state.items.reduce((sum, item) => sum + item.quantity, 0), 2);
  const replay = saveScanItems(savedOther.state, [...transferred.items, ...confirmed.items]);
  assert.equal(replay.state.items.reduce((sum, item) => sum + item.quantity, 0), 2);
  const single = appendRecognition(createScanSession('single-held'), card, 'single', date, true);
  const deferredSingle = deferHeldRecognition(single, card.id, error.recognition, error.diagnostics, 'single-review', date,
    error.reviewChoices!, 'unused');
  assert.equal(deferredSingle.items.length, 0); assert.equal(sessionSummary(deferredSingle).copies, 1);
  assert.equal(deferredSingle.unresolved![0].freeRecognitionRecorded, true);
  assert.equal(linkPendingRecognition(deferredSingle, 'single-review', error.reviewChoices![0], 'single-confirmed', true, 'confirmed').items.length, 1);
});
