import type {
  Card,
  Collection,
  MarketPrice,
  Plan,
  SubscriptionEntitlement,
} from '../types/domain';

export interface CardCatalogService {
  listCards(): Promise<Card[]>;
  getCard(cardId: string): Promise<Card | undefined>;
  searchCards(query: string): Promise<Card[]>;
}

export interface RecognitionOptions {
  simulateFailure?: boolean;
}

export interface CardRecognitionService {
  recognize(options?: RecognitionOptions): Promise<Card>;
}

export interface MarketPricingService {
  getPrice(cardId: string): Promise<MarketPrice>;
}

/** A durable database adapter can implement the same contract later. */
export interface CollectionRepository {
  list(): Promise<Collection[]>;
  save(collection: Collection): Promise<void>;
  remove(collectionId: string): Promise<void>;
}

/** Production purchase validation belongs in an implementation of this interface. */
export interface SubscriptionService {
  getEntitlement(): Promise<SubscriptionEntitlement>;
  setPlan(plan: Plan): Promise<SubscriptionEntitlement>;
}
