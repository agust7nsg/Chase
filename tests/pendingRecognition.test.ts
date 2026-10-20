import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCards } from '../src/services/tcgdex/normalize';
import { createScanSession, restoreScanSession, sessionSummary, linkPendingRecognition, saveScanItems } from '../src/services/scanSession';
import { editPendingQuantity, stagePendingRecognition } from '../src/services/pendingRecognition';
import { ScanSessionStore } from '../src/services/scanSessionStore';
import { initialState, normalizeStoredState } from '../src/services/domain';
import type { CardSightRecognitionResponse } from '../src/services/cardsight/types';

const response: CardSightRecognitionResponse = { candidates: [{ providerId: 'opaque-chespin', name: 'Chespin', setName: 'Chaos Rising',
  collectorNumber: '087/086', language: 'en', confidenceTier: 'High', finish: 'unknown' }] };
const diagnostics = { stage: 'set' as const, inspectedSetIds: [] };
const date = '2026-10-19T18:00:00Z';
const card = normalizeCards({ id: 'example-087', name: 'Chespin', localId: '087', variants: { holo: true },
  set: { id: 'example', name: 'Chaos Rising', cardCount: { official: 86, total: 100 } } }, 'en')[0];
const stage = () => stagePendingRecognition(createScanSession('session'), response, diagnostics, 'unmatched-one', date);

test('unresolved provider identities are retained separately, unpriced and outside permanent ownership', () => {
  const session = stage();
  assert.equal(session.items.length, 0); assert.equal(session.unresolved?.length, 1);
  assert.deepEqual(sessionSummary(session), { copies: 1, value: 0, unpriced: 1 });
  assert.equal(session.freeRecognitionUsed, false);
  const saved = saveScanItems(initialState, session.items);
  assert.deepEqual(saved.state.items, initialState.items); assert.equal(saved.result.savedOperationIds.length, 0);
});

test('deliberate additional copies coalesce but different finishes and candidate sets stay separate', () => {
  let session = stagePendingRecognition(stage(), response, diagnostics, 'new-presentation', date);
  assert.equal(session.unresolved?.length, 1); assert.equal(session.unresolved?.[0].id, 'unmatched-one');
  assert.equal(sessionSummary(session).copies, 2);
  session = stagePendingRecognition(session, { candidates: [{ ...response.candidates[0], finish: 'reverse' }] }, diagnostics, 'different-finish', date);
  assert.equal(session.unresolved?.length, 2);
  session = editPendingQuantity(session, 'unmatched-one', 4);
  assert.equal(sessionSummary(session).copies, 5);
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => editPendingQuantity(session, 'unmatched-one', value));
});

test('unmatched metadata survives local reload and extra fields cannot persist camera bytes or credentials', async () => {
  const values = new Map<string, string>(); let id = 0;
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  const store = new ScanSessionStore(storage, () => 'id-' + ++id, () => {}); await store.load();
  const dirty = { candidates: [{ ...response.candidates[0], base64: 'never-store-photo', apiKey: 'never-store-key' }] };
  await store.update(session => stagePendingRecognition(session, dirty, diagnostics, 'pending', date));
  const serialized = [...values.values()].join(''); assert.equal(serialized.includes('never-store'), false);
  const reopened = new ScanSessionStore(storage, () => 'restored', () => {}); await reopened.load();
  assert.equal(reopened.session.unresolved?.[0].recognition.candidates[0].providerId, 'opaque-chespin');
  assert.equal(sessionSummary(reopened.session).copies, 1);
});

test('explicit linking transfers the full quantity into canonical staging and saves with replay protection', () => {
  const session = editPendingQuantity(stage(), 'unmatched-one', 3);
  const linked = linkPendingRecognition(session, 'unmatched-one', card, 'confirmed-link', true, 'confirmed');
  assert.equal(linked.unresolved?.length, 0); assert.equal(linked.items[0].cardId, card.id);
  assert.equal(linked.items[0].quantity, 3); assert.equal(linked.freeRecognitionUsed, true);
  assert.throws(() => linkPendingRecognition(linked, 'unmatched-one', card, 'retry-link', false, 'confirmed'));
  const saved = saveScanItems(initialState, linked.items);
  assert.equal(saved.state.items[0].quantity, 3);
  const retry = saveScanItems(normalizeStoredState(JSON.parse(JSON.stringify(saved.state))), linked.items);
  assert.equal(retry.state.items[0].quantity, 3);
});

test('linking coalesces matching printings, retains other unresolved cards and enforces the Free recognition marker', () => {
  let pending = stagePendingRecognition(stage(), { candidates: [{ ...response.candidates[0], providerId: 'other' }] }, diagnostics, 'other-row', date);
  pending = linkPendingRecognition(pending, 'unmatched-one', card, 'one', true, 'confirmed');
  assert.equal(pending.unresolved?.length, 1);
  assert.throws(() => linkPendingRecognition(pending, 'other-row', card, 'two', true, 'confirmed'), /free scan/);
  const pro = linkPendingRecognition(pending, 'other-row', card, 'two', false, 'confirmed');
  assert.equal(pro.items.length, 1); assert.equal(pro.items[0].quantity, 2);
});

test('legacy sessions stay compatible while corrupt unresolved records fail without silently clearing data', () => {
  assert.deepEqual(restoreScanSession(createScanSession('old'), 'fallback'), createScanSession('old'));
  const session = stage();
  for (const change of [{ quantity: 0 }, { recognition: { candidates: [] } }, { diagnostics: { stage: 'invalid', inspectedSetIds: [] } }, { identifiedAt: 'bad' }]) {
    assert.throws(() => restoreScanSession({ ...session, unresolved: [{ ...session.unresolved![0], ...change }] }, 'fallback'));
  }
  assert.equal(session.unresolved?.length, 1);
});
