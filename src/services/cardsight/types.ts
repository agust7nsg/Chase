/** Chase's proxy protocol. These fields are NOT an assertion about CardSight's vendor API. */
export interface CardSightCandidate {
  providerId: string;
  name: string;
  setName: string;
  collectorNumber: string;
  language: string;
  finish?: 'normal' | 'holo' | 'reverse' | 'unknown';
  confidence?: number;
  tcgdexId?: string;
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
      || !text(item.collectorNumber, 64) || typeof item.language !== 'string' || !/^[a-z]{2}(?:-[a-z]{2})?$/.test(item.language)
      || (item.finish !== undefined && !['normal', 'holo', 'reverse', 'unknown'].includes(String(item.finish)))
      || (item.confidence !== undefined && (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1))
      || (item.tcgdexId !== undefined && (!text(item.tcgdexId, 200) || !/^[a-zA-Z0-9._-]+$/.test(item.tcgdexId)))) return undefined;
    candidates.push({ providerId: item.providerId, name: item.name, setName: item.setName, collectorNumber: item.collectorNumber,
      language: item.language, ...(item.finish !== undefined ? { finish: item.finish as CardSightCandidate['finish'] } : {}),
      ...(item.confidence !== undefined ? { confidence: item.confidence as number } : {}),
      ...(item.tcgdexId !== undefined ? { tcgdexId: item.tcgdexId as string } : {}) });
  }
  return { candidates };
}

export type CardSightErrorCode = 'ABORTED' | 'BUSY' | 'CONFIGURATION' | 'IMAGE_REQUIRED' | 'INVALID_RESPONSE' | 'NETWORK' | 'TIMEOUT'
  | 'NO_MATCH' | 'CATALOG_UNRESOLVED' | 'AMBIGUOUS' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED';

export class CardSightError extends Error {
  constructor(public readonly code: CardSightErrorCode, message: string) { super(message); this.name = 'CardSightError'; }
}
