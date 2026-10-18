import type { Card, CardVariant, MarketPrice } from '../types/domain';

const cards = new Map<string, Card>();
const legacyIds = new Set<string>();
const variants = new Set<CardVariant>(['Holo', 'Normal', 'Reverse holo', 'First edition', 'W promo', 'Unspecified']);
const listeners = new Set<() => void>();
let revision = 0;

function changed() { revision += 1; listeners.forEach(listener => listener()); }
export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function catalogRevision(): number { return revision; }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function date(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function imageUrl(value: unknown): value is string {
  if (!text(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/** Quotes are estimates with explicit provenance, never inferred from missing data. */
function priceSnapshot(value: unknown): MarketPrice | undefined {
  if (!record(value) || typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount < 0
    || (value.currency !== 'USD' && value.currency !== 'EUR')
    || (value.source !== 'mock' && value.source !== 'tcgplayer' && value.source !== 'cardmarket')
    || !date(value.updatedAt)) return undefined;
  if (value.variant !== undefined && !variants.has(value.variant as CardVariant)) return undefined;
  if (value.variantId !== undefined && !text(value.variantId)) return undefined;
  if (value.kind !== undefined && value.kind !== 'raw' && value.kind !== 'graded') return undefined;
  if (value.metric !== undefined && !text(value.metric)) return undefined;
  if (value.market !== undefined && value.market !== 'US' && value.market !== 'EU') return undefined;
  if (value.grading !== undefined && (!record(value.grading) || !text(value.grading.company) || !text(value.grading.grade))) return undefined;
  return {
    amount: value.amount, currency: value.currency, source: value.source, updatedAt: value.updatedAt,
    ...(value.variant !== undefined ? { variant: value.variant } : {}),
    ...(value.variantId !== undefined ? { variantId: value.variantId } : {}),
    ...(value.kind !== undefined ? { kind: value.kind } : {}),
    ...(value.metric !== undefined ? { metric: value.metric } : {}),
    ...(value.market !== undefined ? { market: value.market } : {}),
    ...(record(value.grading) ? { grading: { company: value.grading.company, grade: value.grading.grade } } : {}),
  } as MarketPrice;
}

/** Only self-contained, matching provider identities may restore dynamic ownership. */
export function validateCatalogSnapshot(value: unknown, id: string): Card | undefined {
  if (!record(value) || value.id !== id || !record(value.catalogIdentity)) return undefined;
  const identity = value.catalogIdentity;
  if (identity.provider !== 'tcgdex' || !text(identity.language) || !text(identity.id) || !text(identity.variant)
    || [identity.language, identity.id, identity.variant].some(part => part.includes(':'))
    || id !== `tcgdex:${identity.language}:${identity.id}:${identity.variant}`) return undefined;
  if (!text(value.name) || !text(value.setName) || !text(value.collectorNumber)
    || !variants.has(value.variant as CardVariant) || typeof value.imageKey !== 'string') return undefined;
  if (value.imageUrl !== undefined && !imageUrl(value.imageUrl)) return undefined;
  for (const key of ['setId', 'localId', 'description'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return undefined;
  }
  const marketPrice = value.marketPrice === null ? null : priceSnapshot(value.marketPrice);
  if (marketPrice === undefined) return undefined;
  let prices: MarketPrice[] | undefined;
  if (value.prices !== undefined) {
    if (!Array.isArray(value.prices)) return undefined;
    prices = [];
    for (const quote of value.prices) {
      const parsed = priceSnapshot(quote);
      if (!parsed) return undefined;
      prices.push(parsed);
    }
  }
  const matchingQuote = (quote: MarketPrice) => quote.source !== 'mock'
    && quote.variant === value.variant && quote.variantId === identity.variant
    && quote.kind !== 'graded' && quote.grading === undefined;
  if ((marketPrice && !matchingQuote(marketPrice)) || prices?.some(quote => !matchingQuote(quote))) return undefined;
  let availableVariants: Card['availableVariants'];
  if (value.availableVariants !== undefined) {
    if (!Array.isArray(value.availableVariants)) return undefined;
    availableVariants = [];
    const printingPrefix = `tcgdex:${identity.language}:${identity.id}:`;
    for (const variant of value.availableVariants) {
      if (!record(variant) || !text(variant.id) || !variant.id.startsWith(printingPrefix)
        || variant.id.slice(printingPrefix.length).includes(':') || !variants.has(variant.label as CardVariant)) return undefined;
      availableVariants.push({ id: variant.id, label: variant.label as CardVariant });
    }
  }
  return {
    id, name: value.name, setName: value.setName, collectorNumber: value.collectorNumber,
    variant: value.variant as CardVariant, imageKey: value.imageKey, marketPrice,
    catalogIdentity: { provider: 'tcgdex', language: identity.language, id: identity.id, variant: identity.variant },
    ...(value.imageUrl !== undefined ? { imageUrl: value.imageUrl as string } : {}),
    ...(value.setId !== undefined ? { setId: value.setId as string } : {}),
    ...(value.localId !== undefined ? { localId: value.localId as string } : {}),
    ...(value.description !== undefined ? { description: value.description as string } : {}),
    ...(prices !== undefined ? { prices } : {}),
    ...(availableVariants !== undefined ? { availableVariants } : {}),
  };
}

/** Legacy keys are reserved forever; external IDs use their own namespace. */
export function registerCatalogCard(card: Card): Card {
  if (!card.catalogIdentity && !card.id.startsWith('tcgdex:')) {
    if (!legacyIds.has(card.id)) { legacyIds.add(card.id); cards.set(card.id, card); changed(); }
    return cards.get(card.id)!;
  }
  const snapshot = validateCatalogSnapshot(card, card.id);
  if (!snapshot || legacyIds.has(card.id)) throw new Error('This catalog printing has an invalid identity.');
  const existing = cards.get(card.id);
  // Search briefs cannot erase complete printing/finish details or a saved quote.
  // A full refreshed response may legitimately replace an old quote with null.
  if (existing?.availableVariants?.length && !snapshot.availableVariants?.length) return existing;
  if (existing && JSON.stringify(existing) === JSON.stringify(snapshot)) return existing;
  cards.set(card.id, snapshot);
  changed();
  return snapshot;
}
export function getRegisteredCard(id: string): Card | undefined { return cards.get(id); }
export function getRegisteredVariants(id: string): Card[] {
  const card = cards.get(id);
  if (!card) return [];
  const identity = card.catalogIdentity;
  return Array.from(cards.values()).filter(other => identity
    ? other.catalogIdentity?.provider === identity.provider && other.catalogIdentity.language === identity.language && other.catalogIdentity.id === identity.id
    : !other.catalogIdentity && other.name === card.name && other.setName === card.setName && other.collectorNumber === card.collectorNumber);
}
/** Simulates a new app process in persistence tests while retaining bundled legacy cards. */
export function clearRemoteCatalog(): void {
  let removed = false;
  for (const id of cards.keys()) if (!legacyIds.has(id)) { cards.delete(id); removed = true; }
  if (removed) changed();
}
