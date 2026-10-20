import type { Card, CardVariant, MarketPrice } from './domain';
import type { CardSightRecognitionResponse, CatalogResolutionDiagnostics } from '../services/cardsight/types';

export interface PendingCatalogRecognition {
  id: string;
  recognition: CardSightRecognitionResponse;
  diagnostics: CatalogResolutionDiagnostics;
  identifiedAt: string;
  quantity: number;
}

export type PriceState = 'loading' | 'available' | 'unavailable';
export interface ScanSessionItem {
  id: string;
  operationId: string;
  cardId: string;
  name: string;
  imageKey: string;
  setName: string;
  collectorNumber: string;
  variant: CardVariant;
  quantity: number;
  identifiedAt: string;
  confidence?: number;
  ambiguity: 'confirmed' | 'review';
  priceState: PriceState;
  price: MarketPrice | null;
  card?: Card;
}
export interface ScanSession {
  version: 1;
  id: string;
  items: ScanSessionItem[];
  /** Identified by the provider, not yet a canonical collectible. Never saved as ownership. */
  unresolved?: PendingCatalogRecognition[];
  /** Never cleared by discarding pending cards. Protects the trial after interrupted persistence. */
  freeRecognitionUsed: boolean;
}
export type RecognitionPhase = 'SEARCHING' | 'CARD_CANDIDATE' | 'IDENTIFYING' | 'RESULT_READY' | 'WAITING_FOR_CARD_CHANGE' | 'ERROR';
export interface ScannerStatus {
  phase: RecognitionPhase;
  cardId: string | null;
  error: string | null;
}
export interface ScanSaveResult {
  savedOperationIds: string[];
  errors: { itemId: string; message: string }[];
}
