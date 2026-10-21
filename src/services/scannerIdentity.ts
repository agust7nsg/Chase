import type { ScanSession } from '../types/scanner';

/** Appearance verification ignores finish, never language or canonical printing. */
export function scannerPrintingKey(cardId: string): string {
  const match = /^tcgdex:([a-z]{2}(?:-[a-z]{2})?):([^:]+):([^:]+)$/i.exec(cardId);
  return match ? `tcgdex:${match[1]}:${match[2]}` : cardId;
}

export function sameScannerPrinting(left: string | null, right: string): boolean {
  return left !== null && scannerPrintingKey(left) === scannerPrintingKey(right);
}

/** Conflicting finish evidence reviews the held row; it cannot add/swap ownership. */
export function reviewHeldFinish(session: ScanSession, heldId: string | null, observedId: string): ScanSession {
  if (heldId === observedId || !sameScannerPrinting(heldId, observedId)) return session;
  if (!session.items.some(item => item.cardId === heldId && item.ambiguity !== 'review')) return session;
  return { ...session, items: session.items.map(item => item.cardId === heldId
    ? { ...item, ambiguity: 'review', priceState: 'unavailable', price: null,
      ...(item.card ? { card: { ...item.card, marketPrice: null } } : {}) }
    : item) };
}
