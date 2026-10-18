export type Plan = 'free' | 'pro';

export type CardVariant = 'Holo' | 'Normal' | 'Reverse holo' | 'First edition' | 'W promo' | 'Unspecified';

export interface MarketPrice {
  amount: number;
  currency: 'USD' | 'EUR';
  source: 'mock' | 'tcgplayer' | 'cardmarket';
  updatedAt: string;
  variant?: CardVariant;
  variantId?: string;
  metric?: string;
  market?: 'US' | 'EU';
  kind?: 'raw' | 'graded';
  grading?: { company: string; grade: string };
}

/** id is the collectible identity. catalogIdentity.id is the independent TCGdex card ID. */
export interface Card {
  id: string;
  name: string;
  setName: string;
  collectorNumber: string;
  variant: CardVariant;
  imageKey: string;
  marketPrice: MarketPrice | null;
  catalogIdentity?: { provider: 'tcgdex'; language: string; id: string; variant: string };
  setId?: string;
  localId?: string;
  imageUrl?: string;
  description?: string;
  availableVariants?: { id: string; label: CardVariant }[];
  prices?: MarketPrice[];
}

export interface CollectionItem {
  cardId: string;
  quantity: number;
  addedAt: string;
  /** Durable reference for real catalog cards; legacy rows are preserved as-is. */
  card?: Card;
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
  createdAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email?: string;
}

export interface ScannerTrialState {
  successfulRecognitions: 0 | 1;
}

export interface SubscriptionEntitlement {
  plan: Plan;
  /** null represents an unlimited allowance. The free limit counts copies. */
  maxCards: number | null;
  scannerEnabled: boolean;
  unlimitedScans: boolean;
  csvExport: boolean;
  gradedPrices: boolean;
  multipleCollections: boolean;
}

export interface PrototypeState {
  onboardingComplete: boolean;
  plan: Plan;
  trial: ScannerTrialState;
  items: CollectionItem[];
  /** Durable receipts make Organize saves replay-safe across interrupted writes. */
  savedScanOperations?: string[];
}

export interface CollectionSummary {
  uniqueCards: number;
  totalCopies: number;
  totalValue: number;
  unpricedCopies?: number;
  hasLivePrices?: boolean;
}
