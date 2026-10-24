import type { CatalogCardBrief, CatalogQuery, CatalogSetDetails } from './types';
import type { Card } from '../../types/domain';
import { priceToUsd } from '../currency';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const compareCollectorNumbers = (a: CatalogCardBrief, b: CatalogCardBrief) =>
  collator.compare(b.localId, a.localId) || collator.compare(b.id, a.id);

/** Compare the actual displayed finish quote in one common currency; absent is not zero. */
export function compareCardPrices(a: Card, b: Card): number {
  const left = priceToUsd(a.marketPrice);
  const right = priceToUsd(b.marketPrice);
  if (left === null && right !== null) return 1;
  if (right === null && left !== null) return -1;
  return (right ?? 0) - (left ?? 0) || collator.compare(b.localId ?? b.collectorNumber, a.localId ?? a.collectorNumber)
    || collator.compare(b.id, a.id);
}

/** A printing appears once, displaying its most valuable supported finish and that finish's own quote. */
export function priceRepresentative(variants: Card[]): Card {
  return [...variants].sort(compareCardPrices)[0];
}

const normalizedNumber = (value: string) => /^\d+$/.test(value) ? String(Number(value)) : value.toUpperCase();

/** A set response contains its complete printing index, not a global search page. */
export function orderedSetCards(set: CatalogSetDetails, query: CatalogQuery): CatalogCardBrief[] {
  const text = (query.collectorNumber ?? query.query ?? '').trim();
  const fraction = text.match(/^(.*?)\s*([a-z]*\d+[a-z]*)\s*\/\s*(\d+)$/i);
  const numberOnly = /^(?:\d+[a-z]*|(?:TG|GG|SV|RC|SH|SM|SWSH|XY|BW|DP|HGSS)\d+[a-z]*)$/i.test(text);
  const localId = fraction?.[2] ?? (query.collectorNumber || numberOnly ? text : undefined);
  const name = (query.collectorNumber ? query.query ?? '' : fraction?.[1] ?? (localId ? '' : text)).trim().toLowerCase();
  if (fraction && Number(fraction[3]) !== set.cardCount?.official) return [];
  return set.cards.filter(card => (!localId || normalizedNumber(card.localId) === normalizedNumber(localId))
    && (!name || card.name.toLowerCase().includes(name))).sort(compareCollectorNumbers);
}
