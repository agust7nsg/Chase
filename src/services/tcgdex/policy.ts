/** Pocket uses a separate digital game, never the physical TCG catalog. */
export function isPocketSet(set: { id?: unknown; seriesId?: unknown; serie?: unknown; logo?: unknown; symbol?: unknown }): boolean {
  const serie = set.serie as { id?: unknown } | undefined;
  return set.seriesId === 'tcgp' || serie?.id === 'tcgp'
    || (typeof set.id === 'string' && /^(?:[A-Z]\d+[a-z]?|P-[A-Z]+)$/.test(set.id))
    || [set.logo, set.symbol].some(url => typeof url === 'string' && url.includes('/tcgp/'));
}
export function isPocketCard(id: string): boolean {
  const canonical = id.startsWith('tcgdex:') ? id.split(':')[2] ?? '' : id;
  return /^(?:[A-Z]\d+[a-z]?|P-[A-Z]+)-/.test(canonical);
}
/** Only Home is curated. Small physical expansions remain in the full directory/search. */
export function showSetOnHome(set: { id: string; cardCount?: { total: number }; seriesId?: string }): boolean {
  return !isPocketSet(set) && (set.cardCount?.total === undefined || set.cardCount.total > 40);
}
