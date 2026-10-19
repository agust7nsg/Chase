/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { getLegacyCard } from '../src/data/mocks/catalog';
import { canScan, initialState, normalizeStoredState, recordSuccessfulScan } from '../src/services/domain';
import { appendRecognition, createScanSession, editSessionQuantity, editSessionVariant, restoreScanSession, saveScanItems, sessionSummary, updateSessionPrice } from '../src/services/scanSession';
import { ScannerController } from '../src/services/scannerController';
import { SCAN_SESSION_KEY, ScanSessionStore, type SessionStorage } from '../src/services/scanSessionStore';
import { MockCardRecognitionService } from '../src/services/mocks';
import type { PrototypeState } from '../src/types/domain';

const date = '2026-10-18T00:00:00.000Z';
const card = (id: string) => getLegacyCard(id)!;
const add = (session = createScanSession('test'), id = 'base1-4', operation = 'op1', free = false) => appendRecognition(session, card(id), operation, date, free);
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const fresh = (): PrototypeState => ({ ...initialState, trial: { successfulRecognitions: 0 }, items: [] });

test('three distinct recognitions stage automatically without mutating permanent collection', () => {
  const collection = fresh();
  const session = add(add(add(), 'swsh7-215', 'op2'), 'sv6-214', 'op3');
  assert.equal(session.items.length, 3);
  assert.equal(sessionSummary(session).copies, 3);
  assert.deepEqual(collection.items, []);
  assert.equal(session.items[0].identifiedAt, date);
  assert.equal(session.items[0].price, null);
});
test('copies of a printing merge but distinct finish IDs remain separate', () => {
  const session = add(add(add(createScanSession('s'), 'xy12-35', 'one'), 'xy12-35', 'two'), 'xy12-35-reverse', 'three');
  assert.equal(session.items.length, 2);
  assert.equal(session.items[0].id, 'one');
  assert.equal(session.items[0].operationId, 'two');
  assert.equal(session.items[0].quantity, 2);
  assert.equal(sessionSummary(session).copies, 3);
});
test('recognition confidence is retained only when supplied; the mock invents no confidence', () => {
  assert.equal(add().items[0].confidence, undefined);
  const provided = appendRecognition(createScanSession('s'), card('base1-4'), 'one', date, false, 'review', 0.82);
  assert.equal(provided.items[0].confidence, 0.82);
  assert.equal(provided.items[0].ambiguity, 'review');
});
test('pending quantities affect only session totals and reject invalid edits', () => {
  const session = updateSessionPrice(add(), 'base1-4', card('base1-4').marketPrice);
  const changed = editSessionQuantity(session, 'op1', 3, 'edited');
  assert.equal(sessionSummary(changed).value, 735);
  assert.equal(session.items[0].quantity, 1);
  assert.deepEqual(initialState.items, []);
  for (const value of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => editSessionQuantity(session, 'op1', value, 'bad'));
});
test('changing to an actual variant clears its old quote and coalesces matching rows', () => {
  const normal = updateSessionPrice(add(createScanSession('s'), 'xy12-35'), 'xy12-35', card('xy12-35').marketPrice);
  const changed = editSessionVariant(normal, 'op1', 'xy12-35-reverse', 'edit');
  assert.equal(changed.items[0].cardId, 'xy12-35-reverse');
  assert.equal(changed.items[0].price, null);
  assert.equal(changed.items[0].priceState, 'loading');
  assert.throws(() => editSessionVariant(normal, 'op1', 'base1-4', 'bad'));
  const both = add(normal, 'xy12-35-reverse', 'reverse');
  const merged = editSessionVariant(both, 'op1', 'xy12-35-reverse', 'merged');
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].quantity, 2);
});
test('price loading, missing and valid zero prices remain distinct, and patches never create cards', () => {
  const session = add();
  assert.equal(sessionSummary(session).unpriced, 1);
  const missing = updateSessionPrice(session, 'base1-4', null);
  assert.equal(missing.items[0].priceState, 'unavailable');
  assert.equal(sessionSummary(missing).unpriced, 1);
  assert.equal(updateSessionPrice(missing, 'other', null), missing);
  const zero = updateSessionPrice(missing, 'base1-4', { ...card('base1-4').marketPrice, amount: 0 });
  assert.equal(zero.items[0].priceState, 'available');
  assert.equal(sessionSummary(zero).unpriced, 0);
});
test('partial saves keep whole rejected rows and enforce total-copy Free limit', () => {
  const state = { ...fresh(), items: [{ cardId: 'base1-4', quantity: 48, addedAt: date }] };
  let session = add(add(add(), 'xy12-35', 'second'), 'base1-2', 'third');
  session = editSessionQuantity(session, 'second', 2, 'second-edited');
  const saved = saveScanItems(state, session.items);
  assert.deepEqual(saved.result.savedOperationIds, ['op1', 'third']);
  assert.equal(saved.result.errors.length, 1);
  assert.match(saved.result.errors[0].message, /up to 50/);
  assert.equal(saved.state.items.reduce((sum, row) => sum + row.quantity, 0), 50);
  assert.equal(saved.state.items.some(row => row.cardId === 'xy12-35'), false);
});
test('save receipts survive reload and make retries safe even if pending cleanup failed', () => {
  const session = editSessionQuantity(add(), 'op1', 3, 'op-quantity');
  const saved = saveScanItems(fresh(), session.items);
  const hydrated = normalizeStoredState(JSON.parse(JSON.stringify(saved.state)));
  const retried = saveScanItems(hydrated, session.items);
  assert.equal(retried.state.items[0].quantity, 3);
  assert.deepEqual(retried.result.savedOperationIds, ['op-quantity']);
  assert.deepEqual(saved.state.items, retried.state.items);
});
test('unconfirmed identification remains pending and does not create permanent ownership', () => {
  const session = appendRecognition(createScanSession('s'), card('xy12-35'), 'review', date, false, 'review');
  const saved = saveScanItems(fresh(), session.items);
  assert.equal(saved.result.savedOperationIds.length, 0);
  assert.deepEqual(saved.state.items, []);
  const confirmed = editSessionVariant(session, 'review', 'xy12-35', 'confirmed');
  assert.equal(saveScanItems(fresh(), confirmed.items).state.items.length, 1);
});
test('free successful marker survives discarding and can repair interrupted quota persistence', () => {
  const session = { ...add(createScanSession('s'), 'base1-4', 'free', true), items: [] };
  const restored = restoreScanSession(JSON.parse(JSON.stringify(session)), 'fallback');
  assert.equal(restored.freeRecognitionUsed, true);
  const repaired = restored.freeRecognitionUsed ? recordSuccessfulScan(fresh()) : fresh();
  assert.equal(canScan(repaired), false);
});
test('restoration re-resolves card metadata/prices and refuses corrupt pending data without resetting', () => {
  const session = add();
  session.items[0].name = 'wrong';
  const restored = restoreScanSession(session, 'fallback');
  assert.equal(restored.items[0].name, 'Charizard');
  assert.equal(restored.items[0].priceState, 'loading');
  assert.throws(() => restoreScanSession({ version: 9, items: [] }, 'f'));
  assert.throws(() => restoreScanSession({ ...session, items: [{ ...session.items[0], quantity: -1 }] }, 'f'));
});
test('serialized session writes preserve additions and failed storage never acknowledges mutation', async () => {
  let saved: string | null = null;
  let failing = false;
  const storage: SessionStorage = { getItem: async () => saved, setItem: async (key, value) => { assert.equal(key, SCAN_SESSION_KEY); if (failing) throw new Error('disk full'); saved = value; } };
  const store = new ScanSessionStore(storage, () => 's', () => {});
  await store.load();
  await Promise.all([store.update(session => add(session, 'base1-4', 'one')), store.update(session => add(session, 'swsh7-215', 'two'))]);
  assert.equal(store.session.items.length, 2);
  failing = true;
  await assert.rejects(store.update(session => add(session, 'sv6-214', 'three')), /disk full/);
  assert.equal(store.session.items.length, 2);
  failing = false;
  const reloaded = new ScanSessionStore(storage, () => 's', () => {});
  await reloaded.load();
  assert.equal(reloaded.session.items.length, 2);
});
test('stable stationary presentation produces exactly one recognition despite many frames', async () => {
  let requests = 0;
  const controller = new ScannerController(async () => { requests++; return 'base1-4'; }, () => {});
  controller.resume(); const now = Date.now();
  for (let t = 0; t <= 1000; t += 100) controller.observe({ fingerprint: 'A', timestamp: now + t }, now + t);
  await tick();
  for (let t = 1100; t <= 10000; t += 100) controller.observe({ fingerprint: 'A', timestamp: now + t }, now + t);
  assert.equal(requests, 1);
  assert.equal(controller.status.phase, 'WAITING_FOR_CARD_CHANGE');
  controller.dispose();
});
test('a removed and deliberately re-presented identical card counts another copy', async () => {
  let requests = 0;
  const controller = new ScannerController(async () => { requests++; return 'base1-4'; }, () => {});
  const now = Date.now(); controller.resume();
  controller.observe({ fingerprint: 'A', timestamp: now }, now);
  controller.observe({ fingerprint: 'A', timestamp: now + 500 }, now + 500); await tick();
  controller.observe(null, now + 2000); controller.observe(null, now + 2400);
  controller.observe({ fingerprint: 'A', timestamp: now + 2500 }, now + 2500);
  controller.observe({ fingerprint: 'A', timestamp: now + 3000 }, now + 3000); await tick();
  assert.equal(requests, 2); controller.dispose();
});
test('different stable cards can be recognized without an empty frame; flicker is insufficient', async () => {
  let requests = 0;
  const controller = new ScannerController(async frame => { requests++; return frame.fingerprint; }, () => {});
  const now = Date.now(); controller.resume();
  controller.observe({ fingerprint: 'A', timestamp: now }, now);
  controller.observe({ fingerprint: 'B', timestamp: now + 200 }, now + 200);
  assert.equal(requests, 0);
  controller.observe({ fingerprint: 'B', timestamp: now + 700 }, now + 700); await tick();
  controller.observe({ fingerprint: 'C', timestamp: now + 2000 }, now + 2000);
  controller.observe({ fingerprint: 'C', timestamp: now + 2500 }, now + 2500); await tick();
  assert.equal(requests, 2); controller.dispose();
});
test('only one request can run, pause aborts it, and late results cannot change scanner state', async () => {
  let resolve!: (value: string) => void;
  let signal!: AbortSignal;
  let requests = 0;
  const controller = new ScannerController((_frame, incoming) => { signal = incoming; requests++; return new Promise(done => { resolve = done; }); }, () => {});
  const now = Date.now(); controller.resume();
  controller.observe({ fingerprint: 'A', timestamp: now }, now);
  controller.observe({ fingerprint: 'A', timestamp: now + 500 }, now + 500);
  for (let t = 1000; t < 5000; t += 100) controller.observe({ fingerprint: 'B', timestamp: now + t }, now + t);
  assert.equal(requests, 1);
  controller.pause(); assert.equal(signal.aborted, true);
  resolve('base1-4'); await tick();
  assert.notEqual(controller.status.phase, 'RESULT_READY');
  controller.dispose();
});
test('failed recognition waits for a deliberate retry and obeys request cooldown', async () => {
  let requests = 0;
  const controller = new ScannerController(async () => { requests++; if (requests === 1) throw new Error('try again'); return 'base1-4'; }, () => {});
  const now = Date.now(); controller.resume();
  controller.observe({ fingerprint: 'A', timestamp: now }, now);
  controller.observe({ fingerprint: 'A', timestamp: now + 500 }, now + 500); await tick();
  assert.equal(controller.status.phase, 'ERROR');
  controller.observe({ fingerprint: 'A', timestamp: now + 2000 }, now + 2000);
  assert.equal(requests, 1);
  controller.retry();
  controller.observe({ fingerprint: 'A', timestamp: now + 2100 }, now + 2100);
  controller.observe({ fingerprint: 'A', timestamp: now + 2600 }, now + 2600); await tick();
  assert.equal(controller.status.phase, 'RESULT_READY');
  assert.equal(requests, 2); controller.dispose();
});
test('cancelable deterministic recognition returns selected printings without spending quota', async () => {
  const service = new MockCardRecognitionService(20);
  const abort = new AbortController();
  const pending = service.recognize({ cardId: 'sv6-214', signal: abort.signal });
  abort.abort(); await assert.rejects(pending, /canceled/);
  assert.equal((await service.recognize({ cardId: 'sv6-214' })).id, 'sv6-214');
  assert.equal(initialState.trial.successfulRecognitions, 0);
});

test('an unresolved finish stays unpriced until explicit variant confirmation', () => {
  const card = getLegacyCard('xy12-35')!;
  let session = appendRecognition(createScanSession('finish-review'), card, 'review-row', '2026-10-19T00:00:00.000Z', false, 'review');
  assert.equal(session.items[0].priceState, 'unavailable');
  session = updateSessionPrice(session, card.id, card.marketPrice);
  assert.equal(session.items[0].price, null);
  assert.equal(sessionSummary(session).value, 0);
  assert.equal(sessionSummary(session).unpriced, 1);
  session = editSessionVariant(session, 'review-row', card.id, 'confirmed-row');
  session = updateSessionPrice(session, card.id, card.marketPrice);
  assert.equal(session.items[0].ambiguity, 'confirmed');
  assert.equal(sessionSummary(session).unpriced, 0);
});
