/** Chase's proxy protocol. These fields are NOT an assertion about CardSight's vendor API. */
export interface CardSightCandidate {
  providerId: string;
  name: string;
  setName: string;
  /** Exact vendor set/release names, never guessed expansion aliases. */
  setNames?: string[];
  collectorNumber: string;
  language: string; // ISO language or und (vendor did not verify a language).
  finish?: 'normal' | 'holo' | 'reverse' | 'unknown';
  /** Conflicting/unsupported parallel evidence must not be inferred from catalog cardinality. */
  finishReviewRequired?: boolean;
  confidence?: number;
  /** Vendor evidence tier; never converted to an invented exact probability. */
  confidenceTier?: 'High' | 'Medium' | 'Low';
  tcgdexId?: string;
  providerSetId?: string;
  providerReleaseId?: string;
}

export interface CardSightRecognitionResponse { candidates: CardSightCandidate[] }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

/** Whitelist and validate the normalized boundary; never forward arbitrary vendor response fields. */
export function parseCardSightRecognitionResponse(value: unknown): CardSightRecognitionResponse | undefined {
  if (!record(value) || !Array.isArray(value.candidates) || value.candidates.length > 12) return undefined;
  const candidates: CardSightCandidate[] = [];
  for (const item of value.candidates) {
    if (!record(item) || !text(item.providerId, 256) || !text(item.name, 200) || !text(item.setName, 200)
      || !text(item.collectorNumber, 64) || typeof item.language !== 'string' || !/^(?:[a-z]{2}(?:-[a-z]{2})?|und)$/.test(item.language)
      || (item.setNames !== undefined && (!Array.isArray(item.setNames) || item.setNames.length < 1 || item.setNames.length > 2 || !item.setNames.every(name => text(name, 200))))
      || (item.confidenceTier !== undefined && !['High', 'Medium', 'Low'].includes(String(item.confidenceTier)))
      || (item.finish !== undefined && !['normal', 'holo', 'reverse', 'unknown'].includes(String(item.finish)))
      || (item.finishReviewRequired !== undefined && typeof item.finishReviewRequired !== 'boolean')
      || (item.confidence !== undefined && (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1))
      || (item.tcgdexId !== undefined && (!text(item.tcgdexId, 200) || !/^[a-zA-Z0-9._-]+$/.test(item.tcgdexId)))) return undefined;
    for (const key of ['providerSetId', 'providerReleaseId']) if (item[key] !== undefined && !text(item[key], 200)) return undefined;
    candidates.push({ providerId: item.providerId, name: item.name, setName: item.setName, collectorNumber: item.collectorNumber,
      language: item.language, ...(item.finish !== undefined ? { finish: item.finish as CardSightCandidate['finish'] } : {}),
      ...(item.finishReviewRequired !== undefined ? { finishReviewRequired: item.finishReviewRequired as boolean } : {}),
      ...(item.setNames !== undefined ? { setNames: item.setNames as string[] } : {}),
      ...(item.confidenceTier !== undefined ? { confidenceTier: item.confidenceTier as CardSightCandidate['confidenceTier'] } : {}),
      ...(item.confidence !== undefined ? { confidence: item.confidence as number } : {}),
      ...(item.tcgdexId !== undefined ? { tcgdexId: item.tcgdexId as string } : {}) });
    if (item.providerSetId !== undefined) candidates[candidates.length - 1].providerSetId = item.providerSetId as string;
    if (item.providerReleaseId !== undefined) candidates[candidates.length - 1].providerReleaseId = item.providerReleaseId as string;
  }
  return { candidates };
}

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
  constructor(readonly recognition: CardSightRecognitionResponse, readonly diagnostics: CatalogResolutionDiagnostics) {
    super('CATALOG_UNRESOLVED', 'Recognized · match the printing in Organize.');
    this.name = 'CatalogResolutionError';
  }
}
