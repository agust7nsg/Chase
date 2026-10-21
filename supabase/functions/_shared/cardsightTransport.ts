/** Server-only CardSight adapter. Contract: user-supplied OpenAPI 3.1, API v1.0.0.
 * POST /v1/identify/card accepts direct binary JPEG, authenticated with X-API-Key.
 * Never import this module into the Expo app. No photos or raw responses are logged.
 */
import { ScannerTransportError, type ScannerTransport } from './transportTypes.ts';
import { parseCardSightRecognitionResponse, type CardSightCandidate, type CardSightRecognitionResponse } from './cardsightProtocol.ts';

const ENDPOINT = 'https://api.cardsight.ai/v1/identify/card';
const MAX_RESPONSE_BYTES = 512 * 1024;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const tier = (value: unknown): value is NonNullable<CardSightCandidate['confidenceTier']> => ['High', 'Medium', 'Low'].includes(String(value));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const invalid = (): never => { throw new ScannerTransportError('provider_response'); };

function validateCard(value: unknown): Record<string, unknown> {
  if (!object(value)) return invalid();
  for (const key of ['id', 'segmentId', 'setId', 'releaseId', 'variationOf']) {
    if (value[key] !== undefined && !uuid(value[key])) return invalid();
  }
  for (const key of ['name', 'setName', 'releaseName', 'number']) {
    if (value[key] !== undefined && !text(value[key], key === 'number' ? 64 : 200)) return invalid();
  }
  if (value.fields !== undefined && (!Array.isArray(value.fields) || value.fields.length > 128
    || value.fields.some(field => !object(field) || typeof field.key !== 'string' || field.key.length > 100
      || typeof field.value !== 'string' || field.value.length > 500))) return invalid();
  if (value.numberedTo !== undefined && !Number.isSafeInteger(value.numberedTo)) return invalid();
  if (value.parallelSuggestions !== undefined && (!Array.isArray(value.parallelSuggestions) || value.parallelSuggestions.length > 64
    || value.parallelSuggestions.some(parallel => !object(parallel) || !uuid(parallel.id) || !text(parallel.name, 200)
      || (parallel.confidence !== undefined && !tier(parallel.confidence))
      || (parallel.numberedTo !== undefined && !Number.isSafeInteger(parallel.numberedTo))
      || (parallel.isPartial !== undefined && parallel.isPartial !== true)
      || (parallel.cards !== undefined && (!Array.isArray(parallel.cards) || parallel.cards.length > 1000 || !parallel.cards.every(uuid)))))) return invalid();
  return value;
}

function finishFor(card: Record<string, unknown>): CardSightCandidate['finish'] {
  // No parallel evidence is NOT evidence of Normal. Multiple alternatives are
  // not resolved by their ranking; CardSight documents ranking/tier independently.
  const parallels = card.parallelSuggestions;
  if (card.numberedTo !== undefined || !Array.isArray(parallels) || parallels.length !== 1) return 'unknown';
  const parallel = parallels[0];
  if (parallel.confidence !== 'High' || parallel.numberedTo !== undefined
    || (parallel.isPartial && !parallel.cards?.includes(card.id))) return 'unknown';
  const name = String(parallel.name).toLowerCase().replace(/[\s_-]/g, '');
  const finishes: Record<string, CardSightCandidate['finish']> = {
    normal: 'normal', holo: 'holo', holofoil: 'holo', reverseholo: 'reverse', reverseholofoil: 'reverse',
  };
  return Object.hasOwn(finishes, name) ? finishes[name] : 'unknown';
}

function candidateFor(card: Record<string, unknown>, confidenceTier: CardSightCandidate['confidenceTier']): CardSightCandidate | undefined {
  // Set-only/slab matches have no exact card ID, subject or number. Never turn
  // them into a printing or misuse numberedTo (a print run) as a denominator.
  if (!uuid(card.id) || !text(card.name, 200) || !text(card.number, 64)) return;
  const names = [...new Set([card.setName, card.releaseName].filter((value): value is string => text(value, 200)))];
  if (!names.length) return;
  const fields = (card.fields ?? []) as { key: string; value: string }[];
  const languages = [...new Set(fields.filter(field => field.key === 'CARD_LANGUAGE').map(field => field.value.trim().toLowerCase()))];
  const language = languages.length === 1 && /^[a-z]{2}$/.test(languages[0]) ? languages[0] : 'und';
  const finish = finishFor(card);
  return { providerId: card.id, name: card.name, setName: names[0], ...(names.length > 1 ? { setNames: names } : {}),
    ...(uuid(card.setId) ? { providerSetId: card.setId } : {}), ...(uuid(card.releaseId) ? { providerReleaseId: card.releaseId } : {}),
    collectorNumber: card.number, language, confidenceTier, finish,
    ...(finish === 'unknown' && (card.numberedTo !== undefined || (Array.isArray(card.parallelSuggestions) && card.parallelSuggestions.length > 0))
      ? { finishReviewRequired: true } : {}) };
}

/** Deliberately small whitelist, independent from the much larger vendor catalog schema. */
export function normalizeCardSightIdentification(value: unknown): CardSightRecognitionResponse {
  if (!object(value) || typeof value.success !== 'boolean' || !text(value.requestId, 256)
    || (value.detections !== undefined && (!Array.isArray(value.detections) || value.detections.length > 32))) return invalid();
  for (const key of ['detectedCount', 'identifiedCount']) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)) return invalid();
  }
  const detections = (value.detections ?? []) as unknown[];
  // Continuous Chase scans one physical presentation at a time. Detections are
  // NOT alternative candidates. Never silently choose one from several cards.
  if (detections.length > 1 || Number(value.detectedCount ?? 0) > 1) throw new ScannerTransportError('multiple_cards');
  const candidates: CardSightCandidate[] = [];
  for (const detection of detections) {
    if (!object(detection) || !tier(detection.confidence)) return invalid();
    const card = validateCard(detection.card);
    if (card.suggestions !== undefined && (!Array.isArray(card.suggestions) || card.suggestions.length > 11)) return invalid();
    const primary = candidateFor(card, detection.confidence);
    if (primary) candidates.push(primary);
    if (detection.confidence !== 'High' && Array.isArray(card.suggestions)) {
      for (const suggestion of card.suggestions) {
        // Suggestion schema has no parallel evidence or own confidence tier.
        const candidate = candidateFor(validateCard(suggestion), detection.confidence);
        if (candidate) candidates.push({ ...candidate, finish: 'unknown' });
      }
    }
  }
  if (!value.success && (candidates.length || Number(value.identifiedCount ?? 0) > 0)) return invalid();
  const result = parseCardSightRecognitionResponse({ candidates });
  return result ?? invalid();
}

async function readResponse(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) { await response.body?.cancel(); return invalid(); }
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body) {
    await response.body?.cancel(); return invalid();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); return invalid(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return invalid(); }
}

/** Fixed HTTPS origin, binary JPEG, caller's abort/timeout, no billable automatic retries. */
export const cardSightTransport: ScannerTransport = async (jpeg, context) => {
  const response = await context.fetch(ENDPOINT, {
    method: 'POST', redirect: 'error', signal: context.signal,
    headers: { 'X-API-Key': context.apiKey, 'Content-Type': 'image/jpeg', Accept: 'application/json' },
    body: jpeg as Uint8Array<ArrayBuffer>,
  });
  if (!response.ok) {
    await response.body?.cancel(); // Never forward/log vendor error bodies or credentials.
    throw new ScannerTransportError(response.status === 401 || response.status === 403 ? 'provider_auth'
      : response.status === 429 ? 'provider_rate_limited'
      : response.status === 400 || response.status === 413 || response.status === 415 ? 'provider_rejected' : 'provider_unavailable');
  }
  return normalizeCardSightIdentification(await readResponse(response));
};
