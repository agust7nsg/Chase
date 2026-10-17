import { getCatalogCard } from '../data/mocks/catalog';
import type { Card, CollectionItem } from '../types/domain';

export type HistoryRange = '7D' | '1M' | '3M' | '1Y';
export type HistoryPoint = { date: string; value: number };

/** All historical values are simulated, ending at the catalog's sample-price date. */
export const HISTORY_AS_OF = '2026-10-01T00:00:00.000Z';

export type HoldingMover = {
  card: Card;
  quantity: number;
  value: number;
  changeAmount: number;
  changePercent: number;
};

const dayMilliseconds = 86_400_000;
const rangeDays: Record<HistoryRange, number> = { '7D': 7, '1M': 30, '3M': 90, '1Y': 365 };
const asOfMilliseconds = Date.parse(HISTORY_AS_OF);

function cents(value: number): number {
  return Math.round(value * 100);
}

function seedFor(cardId: string): number {
  let seed = 2_166_136_261;
  for (let index = 0; index < cardId.length; index += 1) {
    seed = Math.imul(seed ^ cardId.charCodeAt(index), 16_777_619);
  }
  return seed >>> 0;
}

function dailySample(seed: number, daysAgo: number): number {
  let value = seed ^ Math.imul(daysAgo + 1, 0x9e3779b9);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff * 2 - 1;
}

/** A repeatable illustration of price movement, never fetched or forecast market data. */
function sampleCents(card: Card, daysAgo: number): number {
  const currentCents = cents(card.marketPrice.amount);
  if (daysAgo === 0) return currentCents;

  const seed = seedFor(card.id);
  const phase = (seed % 360) * Math.PI / 180;
  const annualDrift = (((seed >>> 8) % 61) - 30) / 100;
  const shortAmplitude = 0.015 + (seed % 6) / 200;
  const longAmplitude = 0.03 + ((seed >>> 5) % 7) / 100;
  const shortMovement = shortAmplitude * (Math.sin(daysAgo / 9 + phase) - Math.sin(phase));
  const longMovement = longAmplitude * (Math.sin(daysAgo / 53 + phase / 2) - Math.sin(phase / 2));
  // Small daily variation keeps the illustrative timeline from appearing as a smooth forecast.
  // Subtract the fixed endpoint sample so every range still ends at the existing catalog price.
  const dailyMovement = 0.0035 * (dailySample(seed, daysAgo) - dailySample(seed, 0));
  const factor = 1 + annualDrift * daysAgo / 365 + shortMovement + longMovement + dailyMovement;
  return Math.max(0, Math.round(currentCents * factor));
}

function timeline(range: HistoryRange): HistoryPoint[] {
  const days = rangeDays[range];
  return Array.from({ length: days + 1 }, (_, index) => ({
    date: new Date(asOfMilliseconds - (days - index) * dayMilliseconds).toISOString(),
    value: 0,
  }));
}

/** Daily USD samples including both endpoints; all ranges share the same trailing curve. */
export function getCardHistory(cardId: string, range: HistoryRange): HistoryPoint[] {
  const card = getCatalogCard(cardId);
  if (!card) return [];
  const days = rangeDays[range];
  return timeline(range).map((point, index) => ({
    ...point,
    value: sampleCents(card, days - index) / 100,
  }));
}

function holdings(items: CollectionItem[]): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!getCatalogCard(item.cardId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
    const quantity = (quantities.get(item.cardId) ?? 0) + item.quantity;
    if (Number.isSafeInteger(quantity)) quantities.set(item.cardId, quantity);
  }
  return quantities;
}

/**
 * Revalues today's copies at simulated earlier prices. This is not earned return:
 * addedAt is deliberately ignored, and no purchases, sales, or past ownership are inferred.
 * An empty portfolio has a dated zero series rather than fabricated owned cards.
 */
export function getPortfolioHistory(items: CollectionItem[], range: HistoryRange): HistoryPoint[] {
  const points = timeline(range);
  const totalsInCents = points.map(() => 0);
  for (const [cardId, quantity] of holdings(items)) {
    const history = getCardHistory(cardId, range);
    history.forEach((point, index) => {
      totalsInCents[index] += cents(point.value) * quantity;
    });
  }
  return points.map((point, index) => ({ ...point, value: totalsInCents[index] / 100 }));
}

/** Percentage change has no finite baseline at zero; display 0 rather than Infinity. */
export function getHistoryChange(points: HistoryPoint[]): { amount: number; percent: number } {
  if (points.length < 2) return { amount: 0, percent: 0 };
  const firstCents = cents(points[0].value);
  const lastCents = cents(points[points.length - 1].value);
  if (!Number.isFinite(firstCents) || !Number.isFinite(lastCents)) return { amount: 0, percent: 0 };
  const differenceCents = lastCents - firstCents;
  const percent = firstCents === 0 ? 0 : Math.round(differenceCents / firstCents * 10_000) / 100;
  return { amount: differenceCents / 100 || 0, percent: percent || 0 };
}

/** Largest absolute USD movement first, with stable card-ID ordering for ties. */
export function getHoldingMovers(items: CollectionItem[], range: HistoryRange): HoldingMover[] {
  return Array.from(holdings(items), ([cardId, quantity]) => {
    const card = getCatalogCard(cardId)!;
    const history = getCardHistory(cardId, range);
    const change = getHistoryChange(history);
    return {
      card: { ...card, marketPrice: { ...card.marketPrice } },
      quantity,
      value: cents(card.marketPrice.amount) * quantity / 100,
      changeAmount: cents(change.amount) * quantity / 100,
      changePercent: change.percent,
    };
  }).sort((left, right) => (
    Math.abs(right.changeAmount) - Math.abs(left.changeAmount) || left.card.id.localeCompare(right.card.id)
  ));
}
