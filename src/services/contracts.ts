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
  cardId?: string;
  signal?: AbortSignal;
  image?: RecognitionImage;
}

/** Ephemeral camera input. Never persisted with a ScanSession or Collection row. */
export interface RecognitionImage {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export interface RecognitionResult extends Card {
  confidence?: number;
  ambiguity?: 'confirmed' | 'review';
}
export interface CardRecognitionService {
  recognize(options?: RecognitionOptions): Promise<RecognitionResult>;
}

export interface MarketPricingService {
  getPrice(cardId: string): Promise<MarketPrice | null>;
}

/** Camera/detector observations; the mock source never inspects real camera frames. */
export interface CardFrame {
  fingerprint: string;
  cardId?: string;
  timestamp: number;
  image?: RecognitionImage;
}

export interface CardFrameSource {
  start(onFrame: (frame: CardFrame | null) => void): () => void;
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
