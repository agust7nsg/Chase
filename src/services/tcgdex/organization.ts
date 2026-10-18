import type { CatalogCardBrief, CatalogQuery, CatalogSetDetails } from './types';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const compareCollectorNumbers = (a: CatalogCardBrief, b: CatalogCardBrief) =>
  collator.compare(a.localId, b.localId) || collator.compare(a.id, b.id);

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
