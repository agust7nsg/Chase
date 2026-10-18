/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { DISPLAY_CURRENCIES, convertCurrency, convertUsd, formatCurrency, formatUsd, normalizeDisplayCurrency, priceToUsd } from '../src/services/currency';
import { getLegacyCard } from '../src/data/mocks/catalog';
import { getCardHistory, getHistoryChange } from '../src/services/priceHistory';

test('display preference accepts only USD and EUR and safely restores older or invalid values', () => {
  assert.deepEqual(DISPLAY_CURRENCIES, ['USD', 'EUR']);
  assert.equal(normalizeDisplayCurrency('EUR'), 'EUR');
  for (const value of [null, undefined, 'USD', 'GBP', 'eur', {}, 1]) assert.equal(normalizeDisplayCurrency(value), 'USD');
});

test('display conversion changes amounts and symbols using one consistent sample rate', () => {
  assert.equal(convertUsd(245, 'EUR'), 225.4);
  assert.equal(formatUsd(245, 'EUR'), '€225.40');
  assert.equal(formatUsd(245, 'USD'), '$245.00');
  assert.equal(formatUsd(1234.56, 'EUR'), '€1,135.80');
  assert.equal(formatUsd(-1.25, 'EUR'), '-€1.15');
  assert.equal(formatUsd(0, 'EUR'), '€0.00');
  assert.equal(formatUsd(-0.001, 'EUR'), '€0.00');
});

test('changing display currency never compounds conversion or mutates catalog/history values', () => {
  const card = getLegacyCard('base1-4')!;
  const history = getCardHistory(card.id, '7D');
  const original = JSON.stringify({ card, history });
  for (let index = 0; index < 20; index += 1) {
    assert.equal(formatUsd(card.marketPrice.amount, 'EUR'), '€225.40');
    assert.equal(formatUsd(card.marketPrice.amount, 'USD'), '$245.00');
    assert.equal(formatUsd(history.at(-1)!.value, 'EUR'), '€225.40');
  }
  assert.equal(JSON.stringify({ card, history }), original);
  assert.equal(card.marketPrice.currency, 'USD');
  assert.equal(getHistoryChange(history).percent, getHistoryChange(getCardHistory(card.id, '7D')).percent);
});

test('currency formatter rejects non-finite values rather than displaying broken amounts', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => formatUsd(value, 'EUR'), RangeError);
});

test('native EUR quotes retain their source amount and convert only for display and aggregation', () => {
  const quote = { amount: 92, currency: 'EUR' as const };
  assert.equal(formatCurrency(quote.amount, quote.currency, 'EUR'), '€92.00');
  assert.equal(formatCurrency(quote.amount, quote.currency, 'USD'), '$100.00');
  assert.equal(priceToUsd(quote), 100);
  assert.equal(convertCurrency(100, 'USD', 'EUR'), 92);
  assert.equal(priceToUsd(null), null);
  assert.equal(priceToUsd({ amount: 0, currency: 'EUR' }), 0);
  assert.deepEqual(quote, { amount: 92, currency: 'EUR' });
});
