/** Development-only HTTP boundary. This module is never imported by the mobile app. */
import { parseCardSightRecognitionResponse } from '../src/services/cardsight/types';
import { ScannerTransportError, type ScannerTransport } from '../supabase/functions/_shared/transportTypes';

export const SCANNER_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const SCANNER_MAX_BODY_BYTES = Math.ceil(SCANNER_MAX_IMAGE_BYTES / 3) * 4 + 1024;

type JsonObject = Record<string, unknown>;
type Outcome = { status: number; body: JsonObject };
type Receipt = { digest: string; result: Promise<Outcome> };

export { ScannerTransportError } from '../supabase/functions/_shared/transportTypes';
export type { ScannerTransport } from '../supabase/functions/_shared/transportTypes';

export interface ScannerProxyOptions {
  apiKey?: string;
  devToken: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  minIntervalMs?: number;
  maxRunRequests?: number;
  tokenTtlMs?: number;
  allowedOrigins?: readonly string[];
  transport?: ScannerTransport;
}

function error(status: number, code: string, message: string): Outcome {
  return { status, body: { error: { code, message } } };
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isSafeInteger(value) && value! >= min && value! <= max ? value! : fallback;
}

function json(outcome: Outcome, origin?: string) {
  return Response.json(outcome.body, { status: outcome.status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  } });
}

async function readJson(request: Request): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > SCANNER_MAX_BODY_BYTES)) throw new RangeError();
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > SCANNER_MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function imageInput(value: unknown): { requestId: string; bytes: Uint8Array } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const body = value as JsonObject;
  if (Object.keys(body).some(key => !['requestId', 'image'].includes(key))) return;
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(body.requestId)) return;
  if (!body.image || typeof body.image !== 'object' || Array.isArray(body.image)) return;
  const image = body.image as JsonObject;
  if (Object.keys(image).some(key => !['base64', 'mimeType', 'width', 'height'].includes(key))) return;
  for (const key of ['width', 'height']) {
    if (image[key] !== undefined && (!Number.isSafeInteger(image[key]) || Number(image[key]) < 1 || Number(image[key]) > 8192)) return;
  }
  if (image.mimeType !== 'image/jpeg' || typeof image.base64 !== 'string') return;
  if (image.base64.length === 0 || image.base64.length % 4 || image.base64.length > Math.ceil(SCANNER_MAX_IMAGE_BYTES / 3) * 4
    || !/^[a-zA-Z0-9+/]+={0,2}$/.test(image.base64)) return;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(image.base64), char => char.charCodeAt(0)); } catch { return; }
  if (bytes.length > SCANNER_MAX_IMAGE_BYTES || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return;
  return { requestId: body.requestId, bytes };
}

async function digest(bytes: Uint8Array) {
  const value = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Fixed-work comparison avoids exiting on the first differing character. */
function matchesToken(actual: string, expected: string) {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= (actual.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  return difference === 0;
}

export function createScannerProxy(options: ScannerProxyOptions): (request: Request) => Promise<Response> {
  if (!/^[a-zA-Z0-9_-]{24,256}$/.test(options.devToken)) throw new Error('SCANNER_DEV_TOKEN must contain 24–256 URL-safe characters.');
  const clock = options.now ?? Date.now;
  const tokenExpires = clock() + boundedInteger(options.tokenTtlMs, 2 * 60 * 60 * 1000, 1, 24 * 60 * 60 * 1000);
  const minInterval = boundedInteger(options.minIntervalMs, 1500, 0, 60_000);
  const requestCap = boundedInteger(options.maxRunRequests, 100, 1, 1000);
  const timeoutMs = boundedInteger(options.timeoutMs, 15_000, 1, 60_000);
  const fetcher = options.fetch ?? fetch;
  const origins = new Set(options.allowedOrigins ?? ['http://localhost:8081', 'http://127.0.0.1:8081']);
  const receipts = new Map<string, Receipt>();
  let count = 0;
  let active = false;
  let lastStarted = -Infinity;

  // Receipts live for this bounded server run. Photos do not: only SHA-256 and
  // sanitized results remain. A replay cannot become another billable request.
  return async request => {
    const pathname = new URL(request.url).pathname;
    const origin = request.headers.get('origin');
    if (origin && !origins.has(origin)) return json(error(403, 'origin_not_allowed', 'This browser origin is not allowed.'));
    const responseOrigin = origin ?? undefined;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        ...(responseOrigin ? { 'Access-Control-Allow-Origin': responseOrigin, Vary: 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store',
      } });
    }
    if (pathname === '/health' && request.method === 'GET') {
      return json({ status: 200, body: { ready: Boolean(options.apiKey && options.transport) && clock() < tokenExpires, mode: 'local-development' } }, responseOrigin);
    }
    if (pathname !== '/recognize') return json(error(404, 'not_found', 'Endpoint not found.'), responseOrigin);
    if (request.method !== 'POST') return json(error(405, 'method_not_allowed', 'Use POST for recognition.'), responseOrigin);
    if (clock() >= tokenExpires) return json(error(401, 'token_expired', 'Restart the local scanner server and reconnect.'), responseOrigin);
    if (!matchesToken(request.headers.get('authorization') ?? '', `Bearer ${options.devToken}`)) {
      return json(error(401, 'unauthorized', 'A valid local scanner token is required.'), responseOrigin);
    }
    if (!options.transport) return json(error(503, 'provider_adapter_missing', 'The recognition adapter is not configured on this server.'), responseOrigin);
    if (!options.apiKey) return json(error(503, 'not_configured', 'Card recognition is not configured on the local server.'), responseOrigin);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json(error(415, 'unsupported_media_type', 'Send a JPEG using the scanner JSON format.'), responseOrigin);
    }
    let input: ReturnType<typeof imageInput>;
    try { input = imageInput(await readJson(request)); }
    catch (cause) {
      return json(cause instanceof RangeError ? error(413, 'image_too_large', 'The image is too large.')
        : error(400, 'invalid_request', 'The scanner request is invalid.'), responseOrigin);
    }
    if (!input) return json(error(400, 'invalid_request', 'Send a valid request ID and base64 JPEG image.'), responseOrigin);
    const fingerprint = await digest(input.bytes);
    const previous = receipts.get(input.requestId);
    if (previous) {
      return json(previous.digest === fingerprint ? await previous.result
        : error(409, 'request_id_conflict', 'Use a new request ID for a different image.'), responseOrigin);
    }
    if (request.signal.aborted) return json(error(499, 'cancelled', 'Recognition was cancelled.'), responseOrigin);
    if (active) return json(error(429, 'busy', 'A card is already being identified.'), responseOrigin);
    if (clock() - lastStarted < minInterval) return json(error(429, 'rate_limited', 'Wait briefly before identifying another card.'), responseOrigin);
    if (count >= requestCap) return json(error(429, 'run_limit', 'The local scanner test limit was reached. Restart the server to continue.'), responseOrigin);
    active = true;
    lastStarted = clock();
    count++;
    const result = recognize(input.bytes, options.apiKey, fetcher, options.transport, timeoutMs, request.signal).finally(() => { active = false; });
    receipts.set(input.requestId, { digest: fingerprint, result });
    return json(await result, responseOrigin);
  };
}

function transportError(cause: unknown): Outcome {
  if (cause instanceof ScannerTransportError) {
    switch (cause.code) {
      case 'multiple_cards': return error(422, cause.code, 'Present one card at a time and retry.');
      case 'provider_auth': return error(503, cause.code, 'The recognition provider credentials need attention on the server.');
      case 'provider_rate_limited': return error(429, cause.code, 'The recognition provider limit was reached. Try again later.');
      case 'provider_rejected': return error(422, cause.code, 'The recognition provider could not read this image. Try a clearer photo.');
      case 'provider_response': return error(502, cause.code, 'The recognition provider returned an unsupported response.');
    }
  }
  return error(503, 'provider_unavailable', 'The recognition provider is unavailable. Try again later.');
}

async function recognize(bytes: Uint8Array, apiKey: string, fetcher: typeof fetch, transport: ScannerTransport,
  timeoutMs: number, caller: AbortSignal): Promise<Outcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onCancel: () => void = () => {};
  const interrupted = new Promise<Outcome>(resolve => {
    onCancel = () => { controller.abort(); resolve(error(499, 'cancelled', 'Recognition was cancelled.')); };
    caller.addEventListener('abort', onCancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      resolve(error(504, 'provider_timeout', 'The recognition provider timed out. Try again when ready.'));
    }, timeoutMs);
    if (caller.aborted) onCancel();
  });
  const operation = (async (): Promise<Outcome> => {
    if (controller.signal.aborted) return error(499, 'cancelled', 'Recognition was cancelled.');
    try {
      const value = await transport(bytes, { apiKey, fetch: fetcher, signal: controller.signal });
      const result = parseCardSightRecognitionResponse(value);
      return result ? { status: 200, body: { candidates: result.candidates } }
        : error(502, 'provider_response', 'The recognition provider returned an unsupported response.');
    } catch (cause) { return transportError(cause); }
  })();
  try { return await Promise.race([interrupted, operation]); }
  finally { if (timer !== undefined) clearTimeout(timer); caller.removeEventListener('abort', onCancel); }
}
