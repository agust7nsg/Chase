/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { getCatalogCard } from '../src/data/mocks/catalog';
import { catalogRevision, clearRemoteCatalog, getRegisteredCard, getRegisteredVariants, registerCatalogCard, subscribeCatalog, validateCatalogSnapshot } from '../src/data/catalogRegistry';
import { addCard, DomainError, initialState, normalizeStoredState, setQuantity, summarizeCollection } from '../src/services/domain';
import { appendRecognition, createScanSession, editSessionVariant, restoreScanSession, saveScanItems, sessionSummary, updateSessionPrice } from '../src/services/scanSession';
import type { Card, CardVariant, MarketPrice, PrototypeState } from '../src/types/domain';

const date = '2026-10-18T00:00:00.000Z';
const fresh = (): PrototypeState => ({ ...initialState, trial: { successfulRecognitions: 0 }, items: [] });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function realCard(key = 'normal', variant: CardVariant = 'Normal', language = 'en'): Card {
  return {
    id: `tcgdex:${language}:xy12-35:${key}`, name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108',
    variant, imageKey: 'tcgdex', imageUrl: 'https://assets.tcgdex.net/en/xy/xy12/35/high.webp',
    catalogIdentity: { provider: 'tcgdex', language, id: 'xy12-35', variant: key },
    setId: 'xy12', localId: '35', marketPrice: null,
    availableVariants: [
      { id: `tcgdex:${language}:xy12-35:normal`, label: 'Normal' },
      { id: `tcgdex:${language}:xy12-35:reverse`, label: 'Reverse holo' },
    ],
  };
}
function quote(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return { amount: 9.2, currency: 'EUR', source: 'cardmarket', updatedAt: date, variant: 'Normal', variantId: 'normal', kind: 'raw', ...overrides };
}

test('provider identities cannot replace legacy keys or collapse separate variants', () => {
  clearRemoteCatalog();
  const normal = registerCatalogCard(realCard());
  const reverse = registerCatalogCard(realCard('reverse', 'Reverse holo'));
  registerCatalogCard(realCard('normal', 'Normal', 'fr'));
  assert.deepEqual(getRegisteredVariants(normal.id).map(card => card.id), [normal.id, reverse.id]);
  assert.notEqual(getCatalogCard('xy12-35')?.id, normal.id);
  assert.equal(getCatalogCard('base2-68')?.name, 'Eevee');
  assert.equal(getCatalogCard('base2-68')?.collectorNumber, '51/130');
  assert.equal(getCatalogCard('swshp-053')?.collectorNumber, '9');
  assert.throws(() => registerCatalogCard({ ...normal, id: 'base2-68' }), /identity/);
  assert.equal(getCatalogCard('base2-68')?.name, 'Eevee');
});

test('unpriced real cards count every owned copy and enforce the Free allowance', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard(realCard());
  const state = setQuantity(addCard(fresh(), card.id), card.id, 50);
  assert.deepEqual(summarizeCollection(state.items), { uniqueCards: 1, totalCopies: 50, totalValue: 0, unpricedCopies: 50 });
  assert.throws(() => addCard(state, 'base1-4'), error => error instanceof DomainError && error.code === 'COLLECTION_LIMIT');
  assert.equal(state.items[0].card?.id, card.id);
  assert.notEqual(state.items[0].card, card);
});

test('collection and pending snapshots survive a cold catalog without fetching or adding ownership', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard({ ...realCard(), marketPrice: quote() });
  const state = setQuantity(addCard(fresh(), card.id), card.id, 2);
  const pending = appendRecognition(createScanSession('cold'), card, 'op', date, true);
  clearRemoteCatalog();
  assert.equal(getCatalogCard(card.id), undefined);
  const restored = normalizeStoredState(copy(state));
  assert.equal(restored.items[0].cardId, card.id);
  assert.deepEqual(summarizeCollection(restored.items), { uniqueCards: 1, totalCopies: 2, totalValue: 20, hasLivePrices: true });
  assert.equal(restored.items[0].card?.marketPrice?.currency, 'EUR');
  clearRemoteCatalog();
  const restoredPending = restoreScanSession(copy(pending), 'unused');
  assert.equal(restoredPending.items[0].card?.id, card.id);
  assert.equal(restoredPending.items[0].priceState, 'loading');
  assert.equal(restoredPending.freeRecognitionUsed, true);
  assert.deepEqual(fresh().items, []);
});

test('Organize saves dynamic snapshots durably and receipts remain replay-safe after restart', () => {
  clearRemoteCatalog();
  const pending = appendRecognition(createScanSession('s'), registerCatalogCard(realCard()), 'saved-once', date, false);
  const saved = saveScanItems(fresh(), pending.items);
  assert.deepEqual(saved.result, { savedOperationIds: ['saved-once'], errors: [] });
  assert.equal(saved.state.items[0].card?.id, pending.items[0].cardId);
  clearRemoteCatalog();
  const restored = normalizeStoredState(copy(saved.state));
  const retried = saveScanItems(restored, restoreScanSession(copy(pending), 'f').items);
  assert.equal(retried.state.items[0].quantity, 1);
  assert.deepEqual(retried.result.savedOperationIds, ['saved-once']);
});

test('variant review keeps dynamic snapshot and stable identity aligned', () => {
  clearRemoteCatalog();
  const normal = registerCatalogCard(realCard());
  const reverse = registerCatalogCard(realCard('reverse', 'Reverse holo'));
  const pending = appendRecognition(createScanSession('s'), normal, 'op', date, false, 'review');
  const changed = editSessionVariant(pending, 'op', reverse.id, 'changed');
  assert.equal(changed.items[0].cardId, reverse.id);
  assert.equal(changed.items[0].card?.catalogIdentity?.variant, 'reverse');
  assert.equal(changed.items[0].ambiguity, 'confirmed');
  clearRemoteCatalog();
  assert.equal(restoreScanSession(copy(changed), 'f').items[0].variant, 'Reverse holo');
});

test('missing or mismatched dynamic references require recovery instead of dropping owned cards', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard(realCard());
  const state = addCard(fresh(), card.id);
  const missing = copy(state);
  delete missing.items[0].card;
  assert.throws(() => normalizeStoredState(missing), /recovery/);
  const mismatch = copy(state);
  mismatch.items[0].card!.catalogIdentity!.variant = 'reverse';
  assert.throws(() => normalizeStoredState(mismatch), /recovery/);
  const pending = appendRecognition(createScanSession('s'), card, 'op', date, false);
  delete pending.items[0].card;
  assert.throws(() => restoreScanSession(pending, 'f'), /recovery/);
  assert.equal(validateCatalogSnapshot({ ...card, imageUrl: 'http://example.com/image.webp' }, card.id), undefined);
});

test('scan quotes preserve currency and provenance changes and reject other variants', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard(realCard());
  const pending = appendRecognition(createScanSession('s'), card, 'op', date, false);
  const priced = updateSessionPrice(pending, card.id, quote());
  assert.equal(sessionSummary(priced).value, 10);
  assert.equal(priced.items[0].card?.marketPrice?.source, 'cardmarket');
  const replacement = quote({ currency: 'USD', source: 'tcgplayer', updatedAt: '2026-10-18T01:00:00.000Z' });
  const repriced = updateSessionPrice(priced, card.id, replacement);
  assert.equal(repriced.items[0].price?.source, 'tcgplayer');
  assert.equal(sessionSummary(repriced).value, 9.2);
  const wrongVariant = updateSessionPrice(repriced, card.id, quote({ variant: 'Reverse holo', variantId: 'reverse' }));
  assert.equal(wrongVariant.items[0].priceState, 'unavailable');
  assert.equal(sessionSummary(wrongVariant).unpriced, 1);
});

test('catalog subscribers observe actual refreshes without repeated identical notifications', () => {
  clearRemoteCatalog();
  let notifications = 0;
  const unsubscribe = subscribeCatalog(() => { notifications += 1; });
  const before = catalogRevision();
  const first = registerCatalogCard(realCard());
  assert.equal(registerCatalogCard(copy(first)), first);
  registerCatalogCard({ ...first, marketPrice: quote() });
  assert.equal(notifications, 2);
  assert.equal(catalogRevision(), before + 2);
  assert.equal(getRegisteredCard(first.id)?.marketPrice?.amount, 9.2);
  unsubscribe();
});

test('brief results cannot erase full references and full refresh can remove a missing quote', () => {
  clearRemoteCatalog();
  const complete = registerCatalogCard({ ...realCard(), marketPrice: quote() });
  const brief = { ...realCard(), availableVariants: undefined };
  assert.equal(registerCatalogCard(brief), complete);
  assert.equal(getRegisteredCard(complete.id)?.marketPrice?.amount, 9.2);
  registerCatalogCard(realCard());
  assert.equal(getRegisteredCard(complete.id)?.marketPrice, null);
});

test('remote snapshots reject a quote from another finish or a graded valuation', () => {
  const wrongFinish = { ...realCard(), marketPrice: quote({ variant: 'Reverse holo', variantId: 'reverse' }) };
  assert.equal(validateCatalogSnapshot(wrongFinish, wrongFinish.id), undefined);
  const graded = { ...realCard(), marketPrice: quote({ kind: 'graded', grading: { company: 'PSA', grade: '10' } }) };
  assert.equal(validateCatalogSnapshot(graded, graded.id), undefined);
});
