import { getCatalogCard } from '../data/mocks/catalog';
import { getRegisteredVariants, registerCatalogCard, validateCatalogSnapshot } from '../data/catalogRegistry';
import type { Card, MarketPrice, PrototypeState } from '../types/domain';
import type { ScanSaveResult, ScanSession, ScanSessionItem } from '../types/scanner';
import { addCard, setQuantity } from './domain';
import { priceToUsd } from './currency';

export function createScanSession(id: string): ScanSession {
  return { version: 1, id, items: [], freeRecognitionUsed: false };
}
export function variantsFor(cardId: string): Card[] {
  return getRegisteredVariants(cardId);
}
export function appendRecognition(session: ScanSession, card: Card, id: string, date: string, isFree: boolean, ambiguity: ScanSessionItem['ambiguity'] = 'confirmed', confidence?: number): ScanSession {
  const snapshot = card.catalogIdentity ? validateCatalogSnapshot(card, card.id) : undefined;
  if ((card.catalogIdentity || card.id.startsWith('tcgdex:')) && !snapshot) throw new Error('This catalog printing needs review before staging.');
  if (snapshot) registerCatalogCard(snapshot);
  const score = typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined;
  if (!Number.isSafeInteger(session.items.reduce((sum, item) => sum + item.quantity, 0) + 1)) throw new Error('Total pending quantity is too large.');
  const existing = session.items.find(item => item.cardId === card.id && item.variant === card.variant && item.ambiguity === ambiguity);
  if (existing && !Number.isSafeInteger(existing.quantity + 1)) throw new Error('Quantity is too large.');
  const items = existing
    ? session.items.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + 1, operationId: id, confidence: score ?? item.confidence, ...(snapshot ? { card: snapshot } : {}) } : item)
    : [...session.items, { id, operationId: id, cardId: card.id, name: card.name, imageKey: card.imageKey, setName: card.setName, collectorNumber: card.collectorNumber, variant: card.variant, quantity: 1, identifiedAt: date, ambiguity, confidence: score, priceState: ambiguity === 'review' ? 'unavailable' as const : 'loading' as const, price: null, ...(snapshot ? { card: snapshot } : {}) }];
  return { ...session, items, freeRecognitionUsed: session.freeRecognitionUsed || isFree };
}
export function editSessionQuantity(session: ScanSession, id: string, quantity: number, operationId: string): ScanSession {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.');
  const total = session.items.reduce((sum, item) => sum + (item.id === id ? quantity : item.quantity), 0);
  if (!Number.isSafeInteger(total)) throw new Error('Total pending quantity is too large.');
  return { ...session, items: session.items.map(item => item.id === id ? { ...item, quantity, operationId } : item) };
}
export function editSessionVariant(session: ScanSession, id: string, cardId: string, operationId: string): ScanSession {
  const item = session.items.find(row => row.id === id);
  const card = variantsFor(item?.cardId ?? '').find(row => row.id === cardId);
  if (!item || !card) throw new Error('This variant is not available for this printing.');
  const remaining = { ...session, items: session.items.filter(row => row.id !== id) };
  const target = remaining.items.find(row => row.cardId === cardId && row.variant === card.variant);
  if (target) {
    const next = editSessionQuantity(remaining, target.id, target.quantity + item.quantity, operationId);
    return { ...next, items: next.items.map(row => row.id === target.id ? { ...row, ambiguity: 'confirmed' } : row) };
  }
  return { ...session, items: session.items.map(row => row.id === id ? { ...row, cardId, name: card.name, imageKey: card.imageKey, setName: card.setName, collectorNumber: card.collectorNumber, variant: card.variant, operationId, ambiguity: 'confirmed', priceState: 'loading', price: null, ...(card.catalogIdentity ? { card: validateCatalogSnapshot(card, card.id)! } : {}) } : row) };
}
export function updateSessionPrice(session: ScanSession, cardId: string, price: MarketPrice | null): ScanSession {
  const card = getCatalogCard(cardId);
  const valid = price !== null && Number.isFinite(price.amount) && price.amount >= 0
    && (price.currency === 'USD' || price.currency === 'EUR')
    && (price.source === 'mock' || price.source === 'tcgplayer' || price.source === 'cardmarket')
    && Number.isFinite(Date.parse(price.updatedAt))
    && (price.variant === undefined || price.variant === card?.variant)
    && (price.variantId === undefined || price.variantId === card?.catalogIdentity?.variant || price.variantId === cardId);
  const nextPrice = valid ? price : null;
  if (!session.items.some(item => item.cardId === cardId && (item.priceState === 'loading' || JSON.stringify(item.price) !== JSON.stringify(nextPrice) || (!valid && item.priceState !== 'unavailable')))) return session;
  return { ...session, items: session.items.map(item => item.cardId === cardId && item.ambiguity === 'confirmed' ? { ...item, priceState: valid ? 'available' : 'unavailable', price: nextPrice, ...(item.card ? { card: { ...item.card, marketPrice: nextPrice } } : {}) } : item) };
}
export function sessionSummary(session: ScanSession) {
  return session.items.reduce((sum, item) => {
    const usd = item.ambiguity === 'confirmed' && item.priceState === 'available' ? priceToUsd(item.price) : null;
    return { copies: sum.copies + item.quantity, value: sum.value + (usd !== null ? Math.round(usd * 100) * item.quantity / 100 : 0), unpriced: sum.unpriced + (usd === null ? item.quantity : 0) };
  }, { copies: 0, value: 0, unpriced: 0 });
}
/** Each row is all-or-nothing; a failed row never prevents other selected rows saving. */
export function saveScanItems(state: PrototypeState, items: ScanSessionItem[]): { state: PrototypeState; result: ScanSaveResult } {
  let next = state;
  const receipts = new Set(state.savedScanOperations ?? []);
  const result: ScanSaveResult = { savedOperationIds: [], errors: [] };
  for (const item of items) {
    if (receipts.has(item.operationId)) { result.savedOperationIds.push(item.operationId); continue; }
    try {
      if (item.cardId.startsWith('tcgdex:')) {
        const snapshot = validateCatalogSnapshot(item.card, item.cardId);
        if (!snapshot) throw new Error('Review this catalog printing before saving.');
        registerCatalogCard(snapshot);
      }
      const card = getCatalogCard(item.cardId);
      if (!card || card.variant !== item.variant) throw new Error('Review this printing before saving.');
      if (item.ambiguity !== 'confirmed') throw new Error('Confirm the variant before saving.');
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('Quantity must be a positive whole number.');
      const owned = next.items.find(row => row.cardId === item.cardId);
      const quantity = (owned?.quantity ?? 0) + item.quantity;
      // Validate the final quantity without partially adding a row on failure.
      const base = owned ? next : addCard(next, item.cardId);
      next = setQuantity(base, item.cardId, quantity);
      receipts.add(item.operationId);
      result.savedOperationIds.push(item.operationId);
    } catch (error) { result.errors.push({ itemId: item.id, message: error instanceof Error ? error.message : 'Unable to save this card.' }); }
  }
  if (result.savedOperationIds.length) next = { ...next, savedScanOperations: [...receipts] };
  return { state: next, result };
}
/** Legacy rows resolve from bundled cards; dynamic rows carry a validated durable reference. */
export function restoreScanSession(value: unknown, fallbackId: string): ScanSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pending scans could not be read.');
  const data = value as Partial<ScanSession>;
  if (data.version !== 1 || typeof data.id !== 'string' || !Array.isArray(data.items) || typeof data.freeRecognitionUsed !== 'boolean') throw new Error('Pending scans use an unsupported format.');
  const items: ScanSessionItem[] = [];
  const ids = new Set<string>();
  const operations = new Set<string>();
  let total = 0;
  for (const row of data.items) {
    const snapshot = row && validateCatalogSnapshot(row.card, row.cardId);
    if (row?.cardId?.startsWith('tcgdex:') && !snapshot) throw new Error('A pending catalog scan needs recovery. Your saved data has not been overwritten.');
    if (snapshot) registerCatalogCard(snapshot);
    const card = row && getCatalogCard(row.cardId);
    if (!card || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.operationId !== 'string' || !row.operationId || operations.has(row.operationId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || !Number.isFinite(Date.parse(row.identifiedAt))) throw new Error('A pending scan needs recovery. Your saved data has not been overwritten.');
    total += row.quantity;
    if (!Number.isSafeInteger(total)) throw new Error('Pending quantity needs recovery.');
    ids.add(row.id);
    operations.add(row.operationId);
    items.push({ ...row, cardId: card.id, name: card.name, setName: card.setName, collectorNumber: card.collectorNumber, imageKey: card.imageKey, variant: card.variant, ambiguity: row.ambiguity === 'review' ? 'review' : 'confirmed', priceState: row.ambiguity === 'review' ? 'unavailable' : 'loading', price: null, ...(snapshot ? { card: snapshot } : {}) });
  }
  return { version: 1, id: data.id || fallbackId, items, freeRecognitionUsed: data.freeRecognitionUsed === true };
}
