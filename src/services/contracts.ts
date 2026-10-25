import type {
  Card,
  Collection,
  MarketPrice,
  Plan,
  SubscriptionEntitlement,
  UserProfile,
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
  onStage?: (stage: 'recognizing' | 'catalog' | 'review') => void;
  /** Camera-first callers stage uncertain matches for Organize instead of interrupting capture. */
  deferReview?: boolean;
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
  confidenceTier?: 'High' | 'Medium' | 'Low';
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
  /** A local multi-frame tracker has already verified presentation stability. */
  stable?: boolean;
  /** False for an appearance change without confirmed removal: verify identity before counting another copy. */
  newPresentation?: boolean;
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

/** Account identity is independent from device-local collections and entitlements. */
export interface AccountAuthenticationService {
  current(): Promise<UserProfile | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, redirectTo: string): Promise<boolean>;
  signOut(): Promise<void>;
  sendReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  completeRedirect(code: string, flowId?: string): Promise<boolean>;
}
