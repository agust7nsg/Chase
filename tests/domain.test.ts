/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../src/data/mocks/catalog';
import {
  addCard,
  canScan,
  DomainError,
  getEntitlements,
  initialState,
  normalizeStoredState,
  recordSuccessfulScan,
  removeCard,
  setQuantity,
  summarizeCollection,
} from '../src/services/domain';
import type { PrototypeState } from '../src/types/domain';

const date = '2026-10-01T12:00:00.000Z';

function freshState(): PrototypeState {
  return { ...initialState, trial: { successfulRecognitions: 0 }, items: [] };
}

function isDomainError(code: DomainError['code']) {
  return (error: unknown) => error instanceof DomainError && error.code === code;
}

test('a free plan offers exactly one successful recognition; pro remains unlimited', () => {
  const state = freshState();
  assert.equal(canScan(state), true);
  const usedTrial = recordSuccessfulScan(state);
  assert.equal(usedTrial.trial.successfulRecognitions, 1);
  assert.equal(canScan(usedTrial), false);
  assert.throws(() => recordSuccessfulScan(usedTrial), isDomainError('SCAN_LIMIT'));
  assert.equal(state.trial.successfulRecognitions, 0);

  const pro: PrototypeState = { ...usedTrial, plan: 'pro' };
  assert.equal(canScan(pro), true);
  assert.equal(canScan(recordSuccessfulScan(recordSuccessfulScan(pro))), true);
});

test('entitlements centralize collection and future feature permissions', () => {
  assert.deepEqual(getEntitlements('free'), {
    plan: 'free', maxCards: 50, scannerEnabled: true, unlimitedScans: false,
    csvExport: false, gradedPrices: false, multipleCollections: false,
  });
  assert.deepEqual(getEntitlements('pro'), {
    plan: 'pro', maxCards: null, scannerEnabled: true, unlimitedScans: true,
    csvExport: true, gradedPrices: true, multipleCollections: true,
  });
});

test('the 50 card free limit counts copies across different cards', () => {
  let state = addCard(freshState(), 'base1-4');
  state = setQuantity(state, 'base1-4', 49);
  state = addCard(state, 'xy12-35');
  assert.equal(summarizeCollection(state.items).totalCopies, 50);
  assert.throws(() => addCard(state, 'base1-4'), isDomainError('COLLECTION_LIMIT'));
  assert.throws(() => addCard(state, 'base1-2'), isDomainError('COLLECTION_LIMIT'));
  assert.throws(() => setQuantity(state, 'xy12-35', 2), isDomainError('COLLECTION_LIMIT'));
  assert.equal(summarizeCollection(state.items).totalCopies, 50);
  const reduced = setQuantity(state, 'base1-4', 48);
  assert.equal(summarizeCollection(addCard(reduced, 'base1-2').items).totalCopies, 50);
});

test('pro permits more than 50 copies', () => {
  let state = addCard({ ...freshState(), plan: 'pro' }, 'base1-4');
  state = setQuantity(state, 'base1-4', 75);
  assert.equal(summarizeCollection(addCard(state, 'base1-2').items).totalCopies, 76);
});

test('quantity rejects fractional, zero, negative, unsafe, and non-finite values', () => {
  const state = addCard(freshState(), 'base1-4');
  for (const quantity of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => setQuantity(state, 'base1-4', quantity), isDomainError('INVALID_QUANTITY'));
  }
  assert.equal(state.items[0].quantity, 1);
  assert.throws(() => setQuantity(state, 'xy12-35', 1), isDomainError('UNKNOWN_CARD'));
  assert.throws(() => addCard(state, 'unknown'), isDomainError('UNKNOWN_CARD'));
});

test('repeat additions increase quantity without duplicating or replacing addedAt', () => {
  const state: PrototypeState = {
    ...freshState(), items: [{ cardId: 'base1-4', quantity: 1, addedAt: date }],
  };
  const next = addCard(state, 'base1-4');
  assert.deepEqual(next.items, [{ cardId: 'base1-4', quantity: 2, addedAt: date }]);
  assert.equal(state.items[0].quantity, 1);
  assert.notEqual(next.items, state.items);
});

test('normal and reverse holo variants retain distinct collection identities', () => {
  let state = addCard(freshState(), 'xy12-35');
  state = addCard(state, 'xy12-35-reverse');
  state = addCard(state, 'xy12-35');
  assert.deepEqual(state.items.map(({ cardId, quantity }) => ({ cardId, quantity })), [
    { cardId: 'xy12-35', quantity: 2 },
    { cardId: 'xy12-35-reverse', quantity: 1 },
  ]);
  assert.deepEqual(summarizeCollection(state.items), { uniqueCards: 2, totalCopies: 3, totalValue: 6.7 });
});

test('valuation multiplies every copy and returns a USD value rounded to cents', () => {
  const summary = summarizeCollection([
    { cardId: 'base1-4', quantity: 2, addedAt: date },
    { cardId: 'base2-68', quantity: 3, addedAt: date },
    { cardId: 'swshp-053', quantity: 2, addedAt: date },
  ]);
  assert.deepEqual(summary, { uniqueCards: 3, totalCopies: 7, totalValue: 512.5 });
  assert.deepEqual(summarizeCollection([]), { uniqueCards: 0, totalCopies: 0, totalValue: 0 });
});

test('removal deletes all copies of one variant and preserves other cards', () => {
  let state = addCard(freshState(), 'xy12-35');
  state = addCard(state, 'xy12-35-reverse');
  state = setQuantity(state, 'xy12-35', 3);
  const next = removeCard(state, 'xy12-35');
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].cardId, 'xy12-35-reverse');
  assert.equal(state.items.length, 2);
});

test('the shared initial state remains immutable and empty', () => {
  addCard(initialState, 'base1-4');
  recordSuccessfulScan(initialState);
  assert.equal(Object.isFrozen(initialState), true);
  assert.equal(Object.isFrozen(initialState.items), true);
  assert.deepEqual(initialState, { onboardingComplete: false, plan: 'free', trial: { successfulRecognitions: 0 }, items: [] });
});

test('stored state round trips valid data without trusting object identity', () => {
  const state: PrototypeState = {
    onboardingComplete: true, plan: 'pro', trial: { successfulRecognitions: 1 },
    items: [{ cardId: 'base1-4', quantity: 72, addedAt: date }],
  };
  const restored = normalizeStoredState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  assert.notEqual(restored.items[0], state.items[0]);
});

test('stored state discards malformed rows, coalesces duplicates, and preserves valid ownership', () => {
  const restored = normalizeStoredState({
    onboardingComplete: 'yes', plan: 'invalid', trial: { successfulRecognitions: 1 },
    items: [
      { cardId: 'unknown', quantity: 4, addedAt: date },
      { cardId: 'base1-4', quantity: -1, addedAt: date },
      { cardId: 'base1-4', quantity: 4, addedAt: 'invalid date' },
      { cardId: 'base1-4', quantity: 20, addedAt: date },
      { cardId: 'base1-4', quantity: 10, addedAt: date },
      { cardId: 'xy12-35', quantity: 25, addedAt: date },
      { cardId: 'base1-2', quantity: 2, addedAt: date },
    ],
  });
  assert.equal(restored.onboardingComplete, false);
  assert.equal(restored.plan, 'free');
  assert.equal(canScan(restored), false);
  assert.deepEqual(restored.items, [
    { cardId: 'base1-4', quantity: 30, addedAt: date },
    { cardId: 'xy12-35', quantity: 25, addedAt: date },
    { cardId: 'base1-2', quantity: 2, addedAt: date },
  ]);
});

test('a downgrade preserves 51 owned copies after reload and blocks additions until below 50', () => {
  const pro: PrototypeState = {
    ...freshState(), plan: 'pro',
    items: [
      { cardId: 'base1-4', quantity: 50, addedAt: date },
      { cardId: 'xy12-35', quantity: 1, addedAt: date },
    ],
  };
  const downgraded = normalizeStoredState(JSON.parse(JSON.stringify({ ...pro, plan: 'free' })));
  assert.equal(summarizeCollection(downgraded.items).totalCopies, 51);
  assert.deepEqual(downgraded.items, pro.items);
  assert.throws(() => addCard(downgraded, 'base1-2'), isDomainError('COLLECTION_LIMIT'));
  assert.throws(() => setQuantity(downgraded, 'base1-4', 51), isDomainError('COLLECTION_LIMIT'));
  const atLimit = setQuantity(downgraded, 'base1-4', 49);
  assert.equal(summarizeCollection(atLimit.items).totalCopies, 50);
  assert.throws(() => addCard(atLimit, 'base1-2'), isDomainError('COLLECTION_LIMIT'));
  const belowLimit = removeCard(atLimit, 'xy12-35');
  assert.equal(summarizeCollection(addCard(belowLimit, 'base1-2').items).totalCopies, 50);
});

test('a downgraded collection may decrease quantities while still over its free allowance', () => {
  const state: PrototypeState = {
    ...freshState(), items: [{ cardId: 'base1-4', quantity: 60, addedAt: date }],
  };
  const reduced = setQuantity(state, 'base1-4', 59);
  assert.equal(reduced.items[0].quantity, 59);
  assert.equal(setQuantity(reduced, 'base1-4', 59).items[0].quantity, 59);
  assert.throws(() => addCard(reduced, 'base1-4'), isDomainError('COLLECTION_LIMIT'));
});

test('hydration omits a corrupt unsafe-total row whole, rather than truncating ownership', () => {
  const restored = normalizeStoredState({
    plan: 'pro',
    items: [
      { cardId: 'base1-4', quantity: Number.MAX_SAFE_INTEGER - 3, addedAt: date },
      { cardId: 'base1-4', quantity: 4, addedAt: date },
      { cardId: 'xy12-35', quantity: 1, addedAt: date },
    ],
  });
  assert.deepEqual(restored.items, [
    { cardId: 'base1-4', quantity: Number.MAX_SAFE_INTEGER - 3, addedAt: date },
    { cardId: 'xy12-35', quantity: 1, addedAt: date },
  ]);
});

test('unusable persisted values fall back to a fresh free state', () => {
  for (const value of [null, undefined, 'invalid', [], 1]) {
    const restored = normalizeStoredState(value);
    assert.deepEqual(restored, initialState);
    assert.notEqual(restored.items, initialState.items);
  }
  assert.deepEqual(normalizeStoredState({ plan: 'free', items: 'invalid' }), initialState);
});

test('catalog has unique variant identities, fixed mock USD prices, and factual printing numbers', () => {
  assert.equal(new Set(catalog.map((card) => card.id)).size, catalog.length);
  assert.equal(catalog.find((card) => card.name === 'Eevee')?.collectorNumber, '68/130');
  const pikachu = catalog.filter((card) => card.name === 'Pikachu');
  assert.equal(pikachu.length, 2);
  assert.equal(pikachu[0].setName, pikachu[1].setName);
  assert.equal(pikachu[0].collectorNumber, pikachu[1].collectorNumber);
  assert.notEqual(pikachu[0].variant, pikachu[1].variant);
  assert.ok(catalog.every((card) => card.marketPrice.source === 'mock' && card.marketPrice.currency === 'USD'));
});
