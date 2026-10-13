export type Plan = 'free' | 'pro';

export type CardVariant = 'Holo' | 'Normal' | 'Reverse holo';

/** A prototype estimate, never a live market quote. */
export interface MarketPrice {
  amount: number;
  currency: 'USD';
  source: 'mock';
  updatedAt: string;
}

/** id identifies a particular printing and variant, rather than a Pokémon. */
export interface Card {
  id: string;
  name: string;
  setName: string;
  collectorNumber: string;
  variant: CardVariant;
  imageKey: string;
  marketPrice: MarketPrice;
}

export interface CollectionItem {
  cardId: string;
  quantity: number;
  addedAt: string;
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
}

export interface CollectionSummary {
  uniqueCards: number;
  totalCopies: number;
  totalValue: number;
}
