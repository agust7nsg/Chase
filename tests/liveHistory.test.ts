/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { clearRemoteCatalog, registerCatalogCard } from '../src/data/catalogRegistry';
import { getCardHistory, getHoldingMovers, getPortfolioHistory, type HistoryRange } from '../src/services/priceHistory';
import { summarizeCollection } from '../src/services/domain';
import type { Card, CollectionItem } from '../src/types/domain';

const date = '2026-10-18T00:00:00.000Z';
const ranges: HistoryRange[] = ['7D', '1M', '3M', '1Y'];
const legacy: CollectionItem = { cardId: 'base1-4', quantity: 2, addedAt: date };
function remoteCard(priced = true): Card {
  return {
    id: 'tcgdex:en:base1-4:holo', name: 'Charizard', setName: 'Base Set', collectorNumber: '4/102', variant: 'Holo',
    imageKey: 'tcgdex', catalogIdentity: { provider: 'tcgdex', language: 'en', id: 'base1-4', variant: 'holo' },
    marketPrice: priced ? { amount: 100, currency: 'USD', source: 'tcgplayer', updatedAt: date, variant: 'Holo', variantId: 'holo', kind: 'raw' } : null,
  };
}

test('current provider quotes never create a card or portfolio historical series', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard(remoteCard());
  const holding: CollectionItem = { cardId: card.id, card, quantity: 3, addedAt: date };
  for (const range of ranges) {
    assert.deepEqual(getCardHistory(card.id, range), []);
    assert.deepEqual(getPortfolioHistory([holding], range), []);
    assert.deepEqual(getHoldingMovers([holding], range), []);
    assert.deepEqual(getPortfolioHistory([legacy, holding], range), []);
    assert.deepEqual(getHoldingMovers([legacy, holding], range), []);
  }
  assert.deepEqual(summarizeCollection([legacy, holding]), { uniqueCards: 2, totalCopies: 5, totalValue: 790, hasLivePrices: true });
});

test('unpriced dynamic holdings keep ownership and suppress fabricated movement after cache loss', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard(remoteCard(false));
  const holding: CollectionItem = { cardId: card.id, card, quantity: 3, addedAt: date };
  clearRemoteCatalog();
  assert.deepEqual(summarizeCollection([legacy, holding]), { uniqueCards: 2, totalCopies: 5, totalValue: 490, unpricedCopies: 3 });
  for (const range of ranges) {
    assert.deepEqual(getPortfolioHistory([legacy, holding], range), []);
    assert.deepEqual(getHoldingMovers([legacy, holding], range), []);
  }
});

test('bundled sample portfolios retain history and invalid external quantities do not alter it', () => {
  clearRemoteCatalog();
  const card = registerCatalogCard(remoteCard());
  for (const range of ranges) {
    const samples = getPortfolioHistory([legacy], range);
    assert.ok(samples.length > 1);
    assert.equal(samples.at(-1)?.value, 490);
    assert.equal(getHoldingMovers([legacy], range).length, 1);
    assert.deepEqual(getPortfolioHistory([legacy, { cardId: card.id, quantity: 0, addedAt: date }], range), samples);
  }
});

test('an external collectible identity cannot borrow sample history from a mock quote', () => {
  clearRemoteCatalog();
  const card = { ...remoteCard(), marketPrice: { amount: 100, currency: 'USD' as const, source: 'mock' as const, updatedAt: date } };
  assert.throws(() => registerCatalogCard(card), /invalid identity/);
  assert.deepEqual(getCardHistory(card.id, '1M'), []);
  assert.deepEqual(getPortfolioHistory([{ cardId: card.id, card, quantity: 1, addedAt: date }], '1M'), []);
});
