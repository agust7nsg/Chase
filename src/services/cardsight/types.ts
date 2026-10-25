import type { CardSightRecognitionResponse } from '../../../supabase/functions/_shared/cardsightProtocol';
import type { Card } from '../../types/domain';
export { parseCardSightRecognitionResponse } from '../../../supabase/functions/_shared/cardsightProtocol';
export type { CardSightCandidate, CardSightRecognitionResponse } from '../../../supabase/functions/_shared/cardsightProtocol';

export interface CatalogResolutionDiagnostics {
  stage: 'language' | 'set' | 'printing' | 'finish' | 'network';
  inspectedSetIds: string[];
}

export type CardSightErrorCode = 'ABORTED' | 'BUSY' | 'CONFIGURATION' | 'IMAGE_REQUIRED' | 'INVALID_RESPONSE' | 'NETWORK' | 'TIMEOUT'
  | 'NO_MATCH' | 'CATALOG_UNRESOLVED' | 'AMBIGUOUS' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED';

export class CardSightError extends Error {
  constructor(public readonly code: CardSightErrorCode, message: string, public readonly recovery: 'card-change' | 'manual' =
    code === 'CONFIGURATION' || code === 'RATE_LIMITED' ? 'manual' : 'card-change') { super(message); this.name = 'CardSightError'; }
}

/** Valid provider metadata only. Never contains camera bytes, a URL token or credentials. */
export class CatalogResolutionError extends CardSightError {
  constructor(readonly recognition: CardSightRecognitionResponse, readonly diagnostics: CatalogResolutionDiagnostics,
    readonly reviewChoices?: Card[]) {
    super('CATALOG_UNRESOLVED', 'Recognized · match the printing in Organize.');
    this.name = 'CatalogResolutionError';
  }
}
