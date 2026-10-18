/** Editorial Home artwork only. Adding a catalog card does not add it to this pool. */
export const FEATURED_CARD_IDS = ['swsh7-192', 'sv6-214', 'swsh7-215'] as const;
export type FeaturedCardId = typeof FEATURED_CARD_IDS[number];
export type FeaturedCardRotation = { remaining: FeaturedCardId[]; lastId: FeaturedCardId };

function isFeaturedCardId(value: unknown): value is FeaturedCardId {
  return FEATURED_CARD_IDS.some(id => id === value);
}

function restoreRotation(stored: string | null): FeaturedCardRotation | null {
  try {
    const value: unknown = stored ? JSON.parse(stored) : null;
    if (!value || typeof value !== 'object' || !('remaining' in value) || !('lastId' in value)) return null;
    const { remaining, lastId } = value;
    if (!isFeaturedCardId(lastId) || !Array.isArray(remaining) || !remaining.every(isFeaturedCardId)) return null;
    if (new Set(remaining).size !== remaining.length || remaining.includes(lastId)) return null;
    return { remaining, lastId };
  } catch {
    return null;
  }
}

/** Draw without replacement; the first draw of a new cycle cannot repeat the last. */
export function nextFeaturedCard(stored: string | null, random: () => number = Math.random): {
  cardId: FeaturedCardId; rotation: FeaturedCardRotation;
} {
  const previous = restoreRotation(stored);
  const remaining = previous?.remaining.length ? [...previous.remaining] : [...FEATURED_CARD_IDS];
  const candidates = remaining.filter(id => id !== previous?.lastId);
  const cardId = candidates[Math.floor(random() * candidates.length)];
  return { cardId, rotation: { remaining: remaining.filter(id => id !== cardId), lastId: cardId } };
}
