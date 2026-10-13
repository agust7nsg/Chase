import { getCatalogCard } from '../data/mocks/catalog';
import type {
  CollectionItem,
  CollectionSummary,
  Plan,
  PrototypeState,
  SubscriptionEntitlement,
} from '../types/domain';

export const FREE_COLLECTION_LIMIT = 50;

export type DomainErrorCode =
  | 'COLLECTION_LIMIT'
  | 'INVALID_QUANTITY'
  | 'UNKNOWN_CARD'
  | 'SCAN_LIMIT';

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export const initialState: PrototypeState = {
  onboardingComplete: false,
  plan: 'free',
  trial: { successfulRecognitions: 0 },
  items: [],
};

// This shared seed cannot be changed accidentally by a screen or repository.
Object.freeze(initialState.trial);
Object.freeze(initialState.items);
Object.freeze(initialState);

export function getEntitlements(plan: Plan): SubscriptionEntitlement {
  const isPro = plan === 'pro';
  return {
    plan,
    maxCards: isPro ? null : FREE_COLLECTION_LIMIT,
    scannerEnabled: true,
    unlimitedScans: isPro,
    csvExport: isPro,
    gradedPrices: isPro,
    multipleCollections: isPro,
  };
}

export function canScan(state: PrototypeState): boolean {
  return getEntitlements(state.plan).unlimitedScans || state.trial.successfulRecognitions === 0;
}

/** Call only after a recognizer has returned a card successfully. */
export function recordSuccessfulScan(state: PrototypeState): PrototypeState {
  if (!canScan(state)) {
    throw new DomainError('SCAN_LIMIT', 'Your free scan has been used. Upgrade to Pro to scan again.');
  }
  if (state.plan === 'pro') return state;
  return { ...state, trial: { successfulRecognitions: 1 } };
}

function requireCard(cardId: string): void {
  if (!getCatalogCard(cardId)) throw new DomainError('UNKNOWN_CARD', 'This card is not in the catalog.');
}

function requireQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new DomainError('INVALID_QUANTITY', 'Quantity must be a positive whole number.');
  }
}

function assertCollectionAllowance(state: PrototypeState, items: CollectionItem[]): void {
  const totalCopies = items.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(totalCopies)) {
    throw new DomainError('INVALID_QUANTITY', 'The total quantity is too large.');
  }
  const maxCards = getEntitlements(state.plan).maxCards;
  const previousCopies = state.items.reduce((sum, item) => sum + item.quantity, 0);
  // A downgrade must preserve ownership and still permit reducing quantities.
  if (maxCards !== null && totalCopies > maxCards && totalCopies > previousCopies) {
    throw new DomainError('COLLECTION_LIMIT', `Free collections hold up to ${maxCards} cards. Upgrade to Pro to add more.`);
  }
}

export function addCard(state: PrototypeState, cardId: string): PrototypeState {
  requireCard(cardId);
  const existing = state.items.find((item) => item.cardId === cardId);
  const items = existing
    ? state.items.map((item) => item.cardId === cardId ? { ...item, quantity: item.quantity + 1 } : item)
    : [...state.items, { cardId, quantity: 1, addedAt: new Date().toISOString() }];
  assertCollectionAllowance(state, items);
  return { ...state, items };
}

export function setQuantity(state: PrototypeState, cardId: string, quantity: number): PrototypeState {
  requireCard(cardId);
  requireQuantity(quantity);
  if (!state.items.some((item) => item.cardId === cardId)) {
    throw new DomainError('UNKNOWN_CARD', 'Add this card to your collection before changing its quantity.');
  }
  const items = state.items.map((item) => item.cardId === cardId ? { ...item, quantity } : item);
  assertCollectionAllowance(state, items);
  return { ...state, items };
}

export function removeCard(state: PrototypeState, cardId: string): PrototypeState {
  return { ...state, items: state.items.filter((item) => item.cardId !== cardId) };
}

/** Values are accumulated in cents to avoid visible floating point artifacts. */
export function summarizeCollection(items: CollectionItem[]): CollectionSummary {
  const uniqueCards = new Set<string>();
  let totalCopies = 0;
  let totalValueCents = 0;
  for (const item of items) {
    const card = getCatalogCard(item.cardId);
    if (!card || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
    uniqueCards.add(item.cardId);
    totalCopies += item.quantity;
    totalValueCents += Math.round(card.marketPrice.amount * 100) * item.quantity;
  }
  return { uniqueCards: uniqueCards.size, totalCopies, totalValue: totalValueCents / 100 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Validate local JSON before restoring it. Invalid rows never reach the UI. */
export function normalizeStoredState(value: unknown): PrototypeState {
  if (!isRecord(value)) return { ...initialState, trial: { ...initialState.trial }, items: [] };
  const plan: Plan = value.plan === 'pro' ? 'pro' : 'free';
  const trialValue = isRecord(value.trial) ? value.trial.successfulRecognitions : undefined;
  const state: PrototypeState = {
    onboardingComplete: value.onboardingComplete === true,
    plan,
    trial: { successfulRecognitions: trialValue === 1 ? 1 : 0 },
    items: [],
  };
  if (!Array.isArray(value.items)) return state;

  let totalCopies = 0;
  for (const row of value.items) {
    if (!isRecord(row) || typeof row.cardId !== 'string' || !getCatalogCard(row.cardId)) continue;
    if (typeof row.quantity !== 'number' || !Number.isSafeInteger(row.quantity) || row.quantity < 1) continue;
    if (!validDate(row.addedAt)) continue;
    // Entitlement limits apply to additions, never to restoring owned cards.
    // A row that would make the total unsafe is corrupt and is omitted whole.
    if (!Number.isSafeInteger(totalCopies + row.quantity)) continue;
    const quantity = row.quantity;
    const existing = state.items.find((item) => item.cardId === row.cardId);
    if (existing) existing.quantity += quantity;
    else state.items.push({ cardId: row.cardId, quantity, addedAt: row.addedAt });
    totalCopies += quantity;
  }
  return state;
}
