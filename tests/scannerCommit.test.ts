import assert from 'node:assert/strict';
import test from 'node:test';
import { ScannerController } from '../src/services/scannerController';
import { ScanSessionStore } from '../src/services/scanSessionStore';
import { appendRecognition, createScanSession, sessionSummary, updateSessionPrice } from '../src/services/scanSession';
import { reviewHeldFinish, sameScannerPrinting } from '../src/services/scannerIdentity';
import { getCatalogCard } from '../src/data/mocks/catalog';
import type { CardFrame } from '../src/services/contracts';
import type { Card } from '../src/types/domain';
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const normal = 'tcgdex:en:xy12-35:normal';
const reverse = 'tcgdex:en:xy12-35:reverse';
const date = '2026-10-21T00:00:00.000Z';

test('appearance identity ignores finish only within the exact namespaced language and printing', () => {
  assert.equal(sameScannerPrinting(normal, reverse), true);
  for (const other of ['tcgdex:fr:xy12-35:normal', 'tcgdex:en:base1-58:normal', 'xy12-35', 'pending:xy12-35', 'tcgdex:en:xy12-35:normal:extra']) {
    assert.equal(sameScannerPrinting(normal, other), false, other);
  }
  assert.equal(sameScannerPrinting(null, normal), false);
  assert.equal(sameScannerPrinting('xy12-35', 'xy12-35-reverse'), false, 'legacy IDs must not be guessed or migrated');
});

test('finish evidence from a held card cannot create a second copy; removal permits a different finish', async () => {
  let now = 0; let id = normal; let copies = 0;
  const controller: ScannerController = new ScannerController(async frame => {
    if (controller.shouldStageResult(frame, id)) copies++;
    controller.acknowledgeCommitted(frame, id);
    return id;
  }, () => {}, () => now);
  const present = async (fingerprint: string, newPresentation: boolean) => {
    now += 2500; controller.observe({ fingerprint, timestamp: now, stable: true, newPresentation }, now); await settle();
  };
  controller.resume();
  await present('initial', true); assert.equal(copies, 1); assert.equal(controller.status.phase, 'RESULT_READY');
  id = reverse; await present('different-glare', false);
  assert.equal(copies, 1); assert.equal(controller.status.phase, 'WAITING_FOR_CARD_CHANGE');
  now += 500; controller.observe(null, now, true);
  await present('deliberate-second-copy', true); assert.equal(copies, 2);
  controller.dispose();
});

test('conflicting finish reviews only the held variant, keeps quantities and ignores late price patches', () => {
  const legacy = getCatalogCard('xy12-35')!;
  const card = (id: string, variant: Card['variant']): Card => ({ ...legacy, id, variant,
    catalogIdentity: { provider: 'tcgdex', language: 'en', id: 'xy12-35', variant: id === normal ? 'normal' : 'reverse' },
    marketPrice: null });
  let session = appendRecognition(createScanSession('s'), card(normal, 'Normal'), 'one', date, false);
  session = appendRecognition(session, card(normal, 'Normal'), 'two', date, false);
  session = appendRecognition(session, card(reverse, 'Reverse holo'), 'three', date, false);
  const reviewed = reviewHeldFinish(session, normal, reverse);
  assert.equal(reviewed.items.length, 2); assert.equal(sessionSummary(reviewed).copies, 3);
  assert.equal(reviewed.items[0].quantity, 2); assert.equal(reviewed.items[0].cardId, normal);
  assert.equal(reviewed.items[0].ambiguity, 'review'); assert.equal(reviewed.items[0].price, null);
  assert.equal(reviewed.items[1], session.items[1], 'another pending finish is untouched');
  const priced = updateSessionPrice(reviewed, normal, { amount: 4, currency: 'USD', source: 'tcgplayer', updatedAt: date, variant: 'Normal', variantId: 'normal' });
  assert.equal(priced.items[0].price, null); assert.equal(priced.items[0].priceState, 'unavailable');
  assert.equal(reviewHeldFinish(createScanSession('empty'), normal, reverse).items.length, 0, 'a saved/deleted row cannot be resurrected');
  assert.equal(reviewHeldFinish(session, normal, 'tcgdex:fr:xy12-35:reverse'), session);
});

test('navigation during a real durable session write keeps one copy and suppresses its stale reveal', async () => {
  let release!: () => void; let writes = 0; let requests = 0; let now = 0;
  const store = new ScanSessionStore({ getItem: async () => null, setItem: async () => {
    writes++; await new Promise<void>(resolve => { release = resolve; });
  } }, () => 'session', () => {});
  await store.load();
  const phases: string[] = [];
  const controller: ScannerController = new ScannerController(async (frame, signal) => {
    requests++;
    await store.update(session => {
      if (signal.aborted) throw new Error('Canceled');
      return appendRecognition(session, getCatalogCard('base1-4')!, 'operation', date, false);
    });
    controller.acknowledgeCommitted(frame, 'base1-4');
    return 'base1-4';
  }, status => phases.push(status.phase), () => now);
  controller.resume();
  const frame: CardFrame = { fingerprint: 'held-card', timestamp: now, stable: true, newPresentation: true };
  controller.observe(frame, now); await settle(); assert.equal(writes, 1);
  controller.pause(); controller.resume(); release(); await settle();
  assert.equal(store.session.items[0].quantity, 1); assert.equal(controller.heldCardId, 'base1-4');
  assert.equal(phases.includes('RESULT_READY'), false, 'navigation invalidates the reveal, not a committed write');
  for (let index = 0; index < 8; index++) { now += 1000; controller.observe(frame, now); }
  await settle(); assert.equal(requests, 1); assert.equal(writes, 1);
  controller.dispose();
});

test('canceling uncommitted work does not lock a card or claim a saved result', async () => {
  let finish!: (id: string) => void; let requests = 0; let now = 0;
  const controller: ScannerController = new ScannerController(async () => { requests++; return new Promise(resolve => { finish = resolve; }); }, () => {}, () => now);
  const frame = { fingerprint: 'held', timestamp: 0, stable: true };
  controller.resume(); controller.observe(frame, now); controller.pause(); controller.resume();
  finish('base1-4'); await settle(); assert.equal(controller.heldCardId, null);
  now = 2000; controller.observe(frame, now); assert.equal(requests, 2);
  finish('base1-4'); await settle(); assert.equal(controller.status.phase, 'RESULT_READY'); controller.dispose();
});

test('a different printing verified by appearance still reveals after its commit acknowledgement', async () => {
  let now = 0; let id = normal;
  const controller: ScannerController = new ScannerController(async frame => { controller.acknowledgeCommitted(frame, id); return id; }, () => {}, () => now);
  controller.resume(); controller.observe({ fingerprint: 'first', timestamp: now, stable: true, newPresentation: true }, now); await settle();
  id = 'tcgdex:en:base1-4:holo'; now = 3000;
  controller.observe({ fingerprint: 'next', timestamp: now, stable: true, newPresentation: false }, now); await settle();
  assert.equal(controller.status.phase, 'RESULT_READY'); assert.equal(controller.status.cardId, id); controller.dispose();
});
