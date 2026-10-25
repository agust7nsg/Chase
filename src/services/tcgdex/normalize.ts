import type { Card, CardVariant, MarketPrice } from '../../types/domain';
import { CatalogError, type CatalogSet, type CatalogSetDetails } from './types';
import { cardArtworkSources } from './artwork';

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function number(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function date(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function https(value: unknown): string | undefined {
  if (!text(value)) return undefined;
  try { return new URL(value).protocol === 'https:' ? value : undefined; } catch { return undefined; }
}

export function collectibleId(language: string, id: string, variant: string): string {
  return `tcgdex:${language}:${id}:${variant}`;
}

export function parseCollectibleId(value: string, language: string): { id: string; variant?: string } {
  if (!value.startsWith('tcgdex:')) return { id: value };
  const parts = value.split(':');
  if (parts.length !== 4 || parts[1] !== language || !parts[2] || !parts[3]) {
    throw new CatalogError('INVALID_RESPONSE', 'This catalog identity is not supported.');
  }
  return { id: parts[2], variant: parts[3] };
}

const finishes: { key: string; label: CardVariant; flag: string; tcgplayer?: string }[] = [
  { key: 'normal', label: 'Normal', flag: 'normal', tcgplayer: 'normal' },
  { key: 'holo', label: 'Holo', flag: 'holo', tcgplayer: 'holofoil' },
  { key: 'reverse', label: 'Reverse holo', flag: 'reverse', tcgplayer: 'reverse-holofoil' },
  { key: 'firstEdition', label: 'First edition', flag: 'firstEdition' },
  { key: 'wPromo', label: 'W promo', flag: 'wPromo' },
];

/** Map only documented provider groups whose finish is unambiguous. */
function pricesFor(raw: Record<string, unknown>, finish: typeof finishes[number]): MarketPrice[] {
  if (!record(raw.pricing)) return [];
  const result: MarketPrice[] = [];
  const player = raw.pricing.tcgplayer;
  if (record(player) && player.unit === 'USD' && date(player.updated) && finish.tcgplayer) {
    const quote = player[finish.tcgplayer] ?? (finish.key === 'reverse' ? player.reverse : undefined);
    if (record(quote) && number(quote.marketPrice)) {
      result.push(Object.freeze({ amount: quote.marketPrice, currency: 'USD', source: 'tcgplayer', updatedAt: player.updated,
        variant: finish.label, variantId: finish.key, metric: 'marketPrice', market: 'US', kind: 'raw' }));
    }
  }
  const market = raw.pricing.cardmarket;
  const variants = raw.variants;
  if (record(market) && market.unit === 'EUR' && date(market.updated) && record(variants)
    && variants.firstEdition !== true && variants.wPromo !== true) {
    const soleFoil = (variants.holo === true) !== (variants.reverse === true);
    const exactGroup = finish.key === 'normal' && variants.normal === true ? 'normal'
      : soleFoil && ((finish.key === 'holo' && variants.holo === true) || (finish.key === 'reverse' && variants.reverse === true)) ? 'foil' : undefined;
    if (exactGroup) {
      const trend = exactGroup === 'foil' ? 'trend-holo' : 'trend';
      const avg = exactGroup === 'foil' ? 'avg-holo' : 'avg';
      const metric = number(market[trend]) ? trend : number(market[avg]) ? avg : undefined;
      if (metric) result.push(Object.freeze({ amount: market[metric] as number, currency: 'EUR', source: 'cardmarket', updatedAt: market.updated,
        variant: finish.label, variantId: finish.key, metric, market: 'EU', kind: 'raw' }));
    }
  }
  return result;
}

export function normalizeCards(value: unknown, language: string): Card[] {
  if (!record(value) || !text(value.id) || value.id.includes(':') || !text(value.name) || !text(value.localId)
    || !record(value.set) || !text(value.set.id) || !text(value.set.name)) {
    throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid card.');
  }
  const supported = finishes.filter(finish => record(value.variants) && value.variants[finish.flag] === true);
  if (supported.length === 0) supported.push({ key: 'unspecified', label: 'Unspecified', flag: 'unspecified' });
  const availableVariants = supported.map(finish => ({ id: collectibleId(language, value.id as string, finish.key), label: finish.label }));
  const count = record(value.set.cardCount) && number(value.set.cardCount.official) ? value.set.cardCount.official : undefined;
  // Promo/subset identifiers are already complete numbers; set totals are not
  // a printed denominator for identifiers such as XY133 or TG05.
  const collectorNumber = `${value.localId}${count === undefined || count === 0 || !/^\d+[a-z]?$/i.test(value.localId as string) ? '' : `/${count}`}`;
  const image = https(value.image);
  const imageUrl = cardArtworkSources(image)[0];
  return supported.map(finish => {
    const prices = pricesFor(value, finish);
    return {
      id: collectibleId(language, value.id as string, finish.key), name: value.name as string,
      setName: (value.set as Record<string, unknown>).name as string,
      setId: (value.set as Record<string, unknown>).id as string, localId: value.localId as string,
      collectorNumber,
      variant: finish.label, imageKey: '', marketPrice: prices[0] ?? null, prices,
      catalogIdentity: { provider: 'tcgdex', language, id: value.id as string, variant: finish.key },
      availableVariants: availableVariants.map(variant => ({ ...variant })),
      ...(imageUrl ? { imageUrl } : {}),
      ...(text(value.description) ? { description: value.description } : {}),
    };
  });
}

export function normalizeSet(value: unknown): CatalogSet {
  if (!record(value) || !text(value.id) || !text(value.name)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid set.');
  const count = value.cardCount;
  return { id: value.id, name: value.name,
    ...(date(value.releaseDate) ? { releaseDate: value.releaseDate } : {}),
    ...(record(count) && number(count.official) && number(count.total) ? { cardCount: { official: count.official, total: count.total } } : {}),
    ...(https(value.logo) ? { logo: https(value.logo) } : {}), ...(https(value.symbol) ? { symbol: https(value.symbol) } : {}),
  };
}

export function normalizeSetDetails(value: unknown): CatalogSetDetails {
  const set = normalizeSet(value);
  if (!record(value) || !Array.isArray(value.cards)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned invalid set cards.');
  return { ...set, ...(text(value.releaseDate) ? { releaseDate: value.releaseDate } : {}), cards: value.cards.map(normalizeBrief) };
}

export function normalizeBrief(value: unknown): { id: string; name: string; localId: string; image?: string } {
  if (!record(value) || !text(value.id) || !text(value.name) || !text(value.localId)) throw new CatalogError('INVALID_RESPONSE', 'TCGdex returned an invalid card list.');
  return { id: value.id, name: value.name, localId: value.localId, ...(https(value.image) ? { image: https(value.image) } : {}) };
}
