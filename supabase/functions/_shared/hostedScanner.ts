import { parseCardSightRecognitionResponse } from './cardsightProtocol.ts';
import { ScannerTransportError } from './transportTypes.ts';
import { boundedJson, deadline, failure, isUserId, MAX_BODY_BYTES, scannerImage, ScannerDeadlineError, type HostedScannerOptions, type ScannerOutcome } from './hostedProtocol.ts';

/** Authenticated, durable, multi-instance boundary. It never persists photographs or raw provider bodies. */
export function createHostedScanner(options: HostedScannerOptions): (request: Request) => Promise<Response> {
  const origins = new Set(options.allowedOrigins ?? []);
  return async request => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) };
    const respond = (outcome: ScannerOutcome) => Response.json(outcome.body, { status: outcome.status, headers });
    if (origin && !origins.has(origin)) return respond(failure(403, 'origin_not_allowed'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info', 'Access-Control-Max-Age': '600' } });
    const path = new URL(request.url).pathname;
    const action = /\/(?:cardsight-scanner\/)?(health|recognize)$/.exec(path)?.[1];
    if (!action) return respond(failure(404, 'not_found'));
    if (request.method !== (action === 'health' ? 'GET' : 'POST')) return respond(failure(405, 'method_not_allowed'));
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization)) return respond(failure(401, 'login_required'));
    let userId: string | null;
    try { userId = await options.authenticate(authorization.slice(7)); }
    catch { return respond(failure(503, 'authentication_unavailable')); }
    if (!isUserId(userId)) return respond(failure(401, 'login_required'));
    if (!options.configured) return respond(failure(503, 'not_configured'));
    if (action === 'health') {
      try { return respond(await options.store.status(userId)); }
      catch { return respond(failure(503, 'storage_unavailable')); }
    }
    if (request.signal.aborted) return respond(failure(499, 'cancelled'));
    const declared = request.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return respond(failure(413, 'image_too_large'));
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return respond(failure(415, 'unsupported_media_type'));
    let input: ReturnType<typeof scannerImage>;
    try { input = scannerImage(await deadline(signal => boundedJson(request.body, MAX_BODY_BYTES, signal), options.inputTimeoutMs ?? 5000, request.signal)); }
    catch (cause) { return respond(failure(cause instanceof RangeError ? 413 : 400, cause instanceof RangeError ? 'image_too_large' : 'invalid_request')); }
    if (!input) return respond(failure(400, 'invalid_request'));
    const hash = await crypto.subtle.digest('SHA-256', input.bytes as Uint8Array<ArrayBuffer>);
    const fingerprint = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
    let reservation: Awaited<ReturnType<typeof options.store.claim>>;
    try { reservation = await options.store.claim(userId, input.id, fingerprint); }
    catch { return respond(failure(503, 'storage_unavailable')); }
    if (!('lease' in reservation)) return respond(reservation);
    // Once reserved, finish and persist independently from the caller disconnecting.
    // A retry reuses this durable receipt; it must never create another vendor call.
    let outcome: ScannerOutcome;
    try {
      const raw = await deadline(signal => options.recognize(input.bytes, signal), options.providerTimeoutMs ?? 15000);
      const result = parseCardSightRecognitionResponse(raw);
      outcome = result ? { status: 200, body: { candidates: result.candidates } } : failure(502, 'provider_response');
    } catch (cause) {
      const code = cause instanceof ScannerTransportError ? cause.code : cause instanceof ScannerDeadlineError ? 'provider_timeout' : 'provider_unavailable';
      const status = code === 'provider_auth' || code === 'provider_unavailable' ? 503 : code === 'provider_rate_limited' ? 429 : code === 'provider_rejected' || code === 'multiple_cards' ? 422 : code === 'provider_timeout' ? 504 : 502;
      outcome = failure(status, code);
    }
    try { await options.store.complete(userId, input.id, reservation.lease, outcome); }
    catch { return respond(failure(503, 'receipt_pending')); }
    return respond(outcome);
  };
}
