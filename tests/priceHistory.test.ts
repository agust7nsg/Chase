/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../src/data/mocks/catalog';
import { summarizeCollection } from '../src/services/domain';
import {
  getCardHistory,
  getHistoryChange,
  getHoldingMovers,
  getPortfolioHistory,
  HISTORY_AS_OF,
  type HistoryRange,
} from '../src/services/priceHistory';
import type { CollectionItem } from '../src/types/domain';

const ranges: HistoryRange[] = ['7D', '1M', '3M', '1Y'];
const date = '2026-10-17T12:00:00.000Z';
const holdings: CollectionItem[] = [
  { cardId: 'base1-4', quantity: 2, addedAt: date },
  { cardId: 'base2-68', quantity: 3, addedAt: date },
  { cardId: 'swshp-053', quantity: 2, addedAt: date },
];

test('mock history uses fixed UTC windows and exact current catalog endpoints', () => {
  const expectedStarts = ['2026-09-24', '2026-09-01', '2026-07-03', '2025-10-01'];
  const expectedLengths = [8, 31, 91, 366];
  assert.ok(catalog.every((card) => card.marketPrice.updatedAt === HISTORY_AS_OF));
  for (const card of catalog) {
    ranges.forEach((range, index) => {
      const points = getCardHistory(card.id, range);
      assert.equal(points.length, expectedLengths[index]);
      assert.equal(points[0].date, `${expectedStarts[index]}T00:00:00.000Z`);
      assert.deepEqual(points.at(-1), { date: HISTORY_AS_OF, value: card.marketPrice.amount });
      assert.ok(points.every((point) => Number.isFinite(point.value) && point.value >= 0));
      assert.ok(points.every((point, i) => i === 0 || Date.parse(point.date) - Date.parse(points[i - 1].date) === 86_400_000));
    });
  }
});

test('history is deterministic and overlapping ranges show the same prices', () => {
  for (const card of catalog) {
    const year = getCardHistory(card.id, '1Y');
    assert.deepEqual(year, getCardHistory(card.id, '1Y'));
    for (const range of ranges) {
      const points = getCardHistory(card.id, range);
      assert.deepEqual(points, year.slice(-points.length));
    }
  }
  const mutableResult = getCardHistory('base1-4', '7D');
  mutableResult[0].value = -1;
  assert.ok(getCardHistory('base1-4', '7D')[0].value >= 0);
});

test('daily simulated prices include restrained variation in both directions', () => {
  for (const cardId of ['base1-4', 'swsh7-215', 'swsh11-186']) {
    const points = getCardHistory(cardId, '1M');
    const changes = points.slice(1).map((point, index) => point.value - points[index].value);
    assert.ok(changes.some((change) => change > 0), `${cardId} should include an increasing day`);
    assert.ok(changes.some((change) => change < 0), `${cardId} should include a decreasing day`);
    assert.ok(changes.every((change, index) => Math.abs(change) / points[index].value < 0.02), 'Daily sample changes should remain restrained');
  }
});

test('portfolio endpoint matches every saved copy and quantity scales every day in cents', () => {
  for (const range of ranges) {
    const points = getPortfolioHistory(holdings, range);
    assert.equal(points.at(-1)?.value, summarizeCollection(holdings).totalValue);
    const cardPoints = holdings.map((item) => getCardHistory(item.cardId, range));
    points.forEach((point, index) => {
      const expectedCents = holdings.reduce((sum, item, cardIndex) => (
        sum + Math.round(cardPoints[cardIndex][index].value * 100) * item.quantity
      ), 0);
      assert.equal(point.value, expectedCents / 100);
    });
  }
  assert.equal(getPortfolioHistory(holdings, '7D').at(-1)?.value, 512.5);
});

test('historical revaluation does not invent trades from addedAt or change owned state', () => {
  const before = JSON.parse(JSON.stringify(holdings));
  const olderOwnership = holdings.map((item) => ({ ...item, addedAt: '2020-01-01T00:00:00.000Z' }));
  assert.deepEqual(getPortfolioHistory(holdings, '1Y'), getPortfolioHistory(olderOwnership, '1Y'));
  getHoldingMovers(holdings, '1M');
  assert.deepEqual(holdings, before);
});

test('large valid copy counts remain finite, and unsafe duplicate quantity totals are ignored', () => {
  const large: CollectionItem[] = [{ cardId: 'base2-68', quantity: 1_000_000, addedAt: date }];
  const oneCopy = getCardHistory('base2-68', '1Y');
  const portfolio = getPortfolioHistory(large, '1Y');
  portfolio.forEach((point, index) => assert.equal(point.value, Math.round(oneCopy[index].value * 100) * 1_000_000 / 100));
  assert.equal(portfolio.at(-1)?.value, 2_400_000);
  const boundary: CollectionItem[] = [{ cardId: 'base1-4', quantity: Number.MAX_SAFE_INTEGER, addedAt: date }];
  assert.ok(getPortfolioHistory(boundary, '1Y').every((point) => Number.isFinite(point.value)));
  assert.deepEqual(getPortfolioHistory([...boundary, { ...boundary[0], quantity: 1 }], '1Y'), getPortfolioHistory(boundary, '1Y'));
});

test('empty, unknown, and invalid holdings do not create value or non-finite changes', () => {
  assert.deepEqual(getCardHistory('not-a-card', '1M'), []);
  const invalid: CollectionItem[] = [
    { cardId: 'not-a-card', quantity: 5, addedAt: date },
    ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((quantity) => ({
      cardId: 'base1-4', quantity, addedAt: date,
    })),
  ];
  for (const range of ranges) {
    const empty = getPortfolioHistory([], range);
    assert.ok(empty.length > 1 && empty.every((point) => point.value === 0));
    assert.deepEqual(getPortfolioHistory(invalid, range), empty);
    assert.deepEqual(getHistoryChange(empty), { amount: 0, percent: 0 });
    assert.deepEqual(getHoldingMovers(invalid, range), []);
  }
  assert.deepEqual(getHistoryChange([]), { amount: 0, percent: 0 });
  assert.deepEqual(getHistoryChange([{ date, value: 245 }]), { amount: 0, percent: 0 });
  assert.deepEqual(getHistoryChange([{ date, value: 0 }, { date, value: 10 }]), { amount: 10, percent: 0 });
  for (const invalid of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    assert.deepEqual(getHistoryChange([{ date, value: invalid }, { date, value: 10 }]), { amount: 0, percent: 0 });
    assert.deepEqual(getHistoryChange([{ date, value: 10 }, { date, value: invalid }]), { amount: 0, percent: 0 });
  }
});

test('change is signed, rounded to cents, and measured against the starting value', () => {
  assert.deepEqual(getHistoryChange([{ date, value: 100 }, { date, value: 112.35 }]), { amount: 12.35, percent: 12.35 });
  assert.deepEqual(getHistoryChange([{ date, value: 120 }, { date, value: 100 }]), { amount: -20, percent: -16.67 });
  assert.deepEqual(getHistoryChange([{ date, value: 2.4 }, { date, value: 2.41 }]), { amount: 0.01, percent: 0.42 });
  for (const range of ranges) {
    const changes = catalog.map((card) => getHistoryChange(getCardHistory(card.id, range)).amount);
    assert.ok(changes.some((amount) => amount > 0), `Expected an increase in ${range}`);
    assert.ok(changes.some((amount) => amount < 0), `Expected a decrease in ${range}`);
  }
});

test('movers combine duplicate copies, scale USD change, and rank absolute position movement', () => {
  const items = [...holdings, { ...holdings[0], quantity: 1 }];
  const movers = getHoldingMovers(items, '1M');
  assert.equal(movers.length, 3);
  assert.ok(movers.every((mover, index) => index === 0 || Math.abs(movers[index - 1].changeAmount) >= Math.abs(mover.changeAmount)));
  const charizard = movers.find((mover) => mover.card.id === 'base1-4')!;
  const oneCopyChange = getHistoryChange(getCardHistory('base1-4', '1M'));
  assert.equal(charizard.quantity, 3);
  assert.equal(charizard.value, 735);
  assert.equal(charizard.changeAmount, Math.round(oneCopyChange.amount * 100) * 3 / 100);
  assert.equal(charizard.changePercent, oneCopyChange.percent);
  const aggregateChange = movers.reduce((sum, mover) => sum + Math.round(mover.changeAmount * 100), 0) / 100;
  assert.equal(aggregateChange, getHistoryChange(getPortfolioHistory(items, '1M')).amount);
  assert.deepEqual(movers, getHoldingMovers(items, '1M'));
  charizard.card.marketPrice.amount = 0;
  assert.equal(getHoldingMovers(items, '1M').find((mover) => mover.card.id === 'base1-4')?.value, 735);
});
