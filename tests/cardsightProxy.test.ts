/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createScannerProxy, SCANNER_MAX_BODY_BYTES, ScannerTransportError, type ScannerProxyOptions } from '../server/cardsightProxy';
import type { CardSightRecognitionResponse } from '../src/services/cardsight/types';
import { createLocalScannerServer } from '../server/startScannerProxy';

const token = 'local_testing_pairing_token_1234567890';
const vendorKey = 'test-vendor-key-never-exposed';
const jpeg = btoa(String.fromCharCode(255, 216, 255, 224, 0, 16, 255, 217));
function request(id = 'request_0001', extra: Record<string, unknown> = {}, image = jpeg) {
  return new Request('http://scanner.test/recognize', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: id, image: { mimeType: 'image/jpeg', base64: image }, ...extra }),
  });
}
function proxy(options: Partial<ScannerProxyOptions> = {}) {
  return createScannerProxy({ apiKey: vendorKey, devToken: token, minIntervalMs: 0, transport: async () => ({ candidates: [] }), ...options });
}

test('local scanner health exposes readiness and mode without credentials or usage', async () => {
  const handler = proxy();
  const response = await handler(new Request('http://scanner.test/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ready: true, mode: 'local-development' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const missing = await proxy({ apiKey: undefined })(new Request('http://scanner.test/health'));
  assert.deepEqual(await missing.json(), { ready: false, mode: 'local-development' });
});

test('the default server is disabled until the official vendor contract exists, without spending quota', async () => {
  let fetchCalls = 0;
  const handler = proxy({ transport: undefined, maxRunRequests: 1, fetch: async () => { fetchCalls++; return Response.json({}); } });
  const health = await handler(new Request('http://scanner.test/health'));
  assert.deepEqual(await health.json(), { ready: false, mode: 'local-development' });
  for (const id of ['request_0001', 'request_0002']) {
    const response = await handler(request(id));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'provider_contract_pending');
  }
  assert.equal(fetchCalls, 0);
});

test('recognition requires an unexpired development pairing token independently of CORS', async () => {
  let time = 0;
  const handler = proxy({ now: () => time, tokenTtlMs: 1000 });
  const unpaired = request();
  unpaired.headers.delete('Authorization');
  assert.equal((await handler(unpaired)).status, 401);
  const wrong = request(); wrong.headers.set('Authorization', `Bearer ${token}x`);
  assert.equal((await handler(wrong)).status, 401);
  time = 1001;
  const expired = await handler(request());
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).error.code, 'token_expired');
});

test('browser origins are explicit; native requests need no Origin, and OPTIONS never calls CardSight', async () => {
  let calls = 0;
  const handler = proxy({ allowedOrigins: ['http://localhost:8081'], transport: async () => { calls++; return { candidates: [] }; } });
  const denied = request(); denied.headers.set('Origin', 'https://untrusted.example');
  assert.equal((await handler(denied)).status, 403);
  const preflight = await handler(new Request('http://scanner.test/recognize', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081' } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  assert.equal(calls, 0);
});

test('invalid JPEG, image URL, malformed JSON, extra fields and oversized requests never reach the vendor', async () => {
  let calls = 0;
  const handler = proxy({ transport: async () => { calls++; return { candidates: [] }; } });
  for (const image of ['not base64', btoa('not a jpeg'), 'data:image/jpeg;base64,' + jpeg, '']) {
    assert.equal((await handler(request('request_0001', {}, image))).status, 400);
  }
  assert.equal((await handler(request('request_0001', { imageUrl: 'http://127.0.0.1/private' }))).status, 400);
  assert.equal((await handler(request('request_0001', { secret: vendorKey }))).status, 400);
  assert.equal((await handler(request('x'))).status, 400);
  const malformed = request();
  assert.equal((await handler(new Request(malformed.url, { method: 'POST', headers: malformed.headers, body: '{' }))).status, 400);
  const oversized = request(); oversized.headers.set('Content-Length', String(SCANNER_MAX_BODY_BYTES + 1));
  assert.equal((await handler(oversized)).status, 413);
  const wrongType = request(); wrongType.headers.set('Content-Type', 'image/jpeg');
  assert.equal((await handler(wrongType)).status, 415);
  assert.equal(calls, 0);
});

test('Node HTTP runner exposes health and enforces body limits before buffering photos', async () => {
  const server = createLocalScannerServer(proxy());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.deepEqual(await response.json(), { ready: true, mode: 'local-development' });
    const tooLarge = await fetch(`http://127.0.0.1:${address.port}/recognize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(SCANNER_MAX_BODY_BYTES + 1),
    });
    assert.equal(tooLarge.status, 413);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); }
});

test('classified provider authentication errors are sanitized and request-ID retries never spend another call', async () => {
  let calls = 0;
  const handler = proxy({ transport: async () => {
    calls++;
    const failure = new ScannerTransportError('provider_auth');
    failure.message = `private upstream detail ${vendorKey}`;
    throw failure;
  } });
  const first = await handler(request());
  assert.equal(first.status, 503);
  const text = await first.text();
  assert.equal(JSON.parse(text).error.code, 'provider_auth');
  assert.ok(!text.includes(vendorKey) && !text.includes('private upstream detail'));
  const replay = await handler(request());
  assert.equal(await replay.text(), text);
  assert.equal(calls, 1);
  const differentPhoto = btoa(String.fromCharCode(255, 216, 255, 224, 1, 16, 255, 217));
  const conflict = await handler(request('request_0001', {}, differentPhoto));
  assert.equal(conflict.status, 409);
  assert.equal(calls, 1);
});

test('bounded interval and per-run quota apply to new requests while receipts remain replayable', async () => {
  let time = 0;
  let calls = 0;
  const handler = proxy({ now: () => time, minIntervalMs: 1500, maxRunRequests: 2,
    transport: async () => { calls++; throw new ScannerTransportError('provider_rate_limited'); } });
  assert.equal((await handler(request())).status, 429);
  assert.equal((await (await handler(request('request_0002'))).json()).error.code, 'rate_limited');
  time = 1500;
  assert.equal((await (await handler(request('request_0002'))).json()).error.code, 'provider_rate_limited');
  time = 3000;
  assert.equal((await (await handler(request('request_0003'))).json()).error.code, 'run_limit');
  assert.equal((await (await handler(request())).json()).error.code, 'provider_rate_limited');
  assert.equal(calls, 2, 'the global run cap also bounds retained receipts');
});

test('only one provider call runs at a time; simultaneous duplicate requests join its receipt', async () => {
  let release: ((response: CardSightRecognitionResponse) => void) | undefined;
  let calls = 0;
  const handler = proxy({ transport: async () => { calls++; return new Promise<CardSightRecognitionResponse>(resolve => { release = resolve; }); } });
  const first = handler(request());
  for (let attempt = 0; !release && attempt < 250; attempt++) await new Promise(resolve => { setTimeout(resolve, 1); });
  assert.ok(release, 'the recognition transport starts its provider request');
  const duplicate = handler(request());
  const second = await handler(request('request_0002'));
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error.code, 'busy');
  release({ candidates: [] });
  const [one, two] = await Promise.all([first, duplicate]);
  assert.equal(await one.text(), await two.text());
  assert.equal(calls, 1);
});

test('timeouts abort the vendor call without automatic retry and release the active lock', async () => {
  let aborted = false;
  let calls = 0;
  const handler = proxy({ timeoutMs: 5, transport: async (_bytes, context) => {
    calls++;
    context.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise<CardSightRecognitionResponse>(() => {});
  } });
  const first = await handler(request());
  assert.equal(first.status, 504);
  assert.equal((await first.json()).error.code, 'provider_timeout');
  assert.equal(aborted, true);
  assert.equal((await handler(request())).status, 504);
  assert.equal(calls, 1);
  assert.equal((await handler(request('request_0002'))).status, 504);
  assert.equal(calls, 2);
});

test('client cancellation aborts recognition and is replay-safe without keeping the camera blocked', async () => {
  const controller = new AbortController();
  let begin: (() => void) | undefined;
  const started = new Promise<void>(resolve => { begin = resolve; });
  let calls = 0;
  const handler = proxy({ transport: async () => { calls++; begin?.(); return new Promise<CardSightRecognitionResponse>(() => {}); } });
  const original = request();
  const pending = handler(new Request(original, { signal: controller.signal }));
  await Promise.race([started, new Promise<never>((_resolve, reject) => { setTimeout(() => { reject(new Error('Provider request did not start.')); }, 1000); })]);
  controller.abort();
  const cancelled = await pending;
  assert.equal(cancelled.status, 499);
  assert.equal((await cancelled.json()).error.code, 'cancelled');
  assert.equal((await handler(request())).status, 499);
  assert.equal(calls, 1);
});

test('normalized recognition returns only the Chase whitelist and preserves no-match responses', async () => {
  const fixture = { candidates: [{ providerId: 'vendor_123', name: 'Pikachu', setName: 'Base Set', collectorNumber: '58/102',
    language: 'en', finish: 'normal', confidence: 0.98, tcgdexId: 'base1-58', internalSecret: vendorKey }], rawResponse: vendorKey };
  let seenJpeg: Uint8Array | undefined;
  const handler = proxy({ transport: async (bytes, context) => {
    seenJpeg = bytes;
    assert.equal(context.apiKey, vendorKey);
    assert.equal(context.signal.aborted, false);
    return fixture as CardSightRecognitionResponse;
  } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes(vendorKey) && !text.includes('internalSecret') && !text.includes('rawResponse'));
  assert.equal(JSON.parse(text).candidates[0].tcgdexId, 'base1-58');
  assert.deepEqual(Array.from(seenJpeg ?? []), [255, 216, 255, 224, 0, 16, 255, 217]);
  const empty = await proxy()(request());
  assert.deepEqual(await empty.json(), { candidates: [] });
});

test('malformed provider results and unknown network errors remain recoverable and never expose raw details', async () => {
  const malformed = proxy({ transport: async () => ({ candidates: [{ providerId: 'incomplete' }] }) as unknown as CardSightRecognitionResponse });
  const bad = await malformed(request());
  assert.equal(bad.status, 502);
  assert.equal((await bad.json()).error.code, 'provider_response');
  const network = proxy({ transport: async () => { throw new Error(`network details with ${vendorKey}`); } });
  const offline = await network(request());
  assert.equal(offline.status, 503);
  assert.ok(!(await offline.text()).includes(vendorKey));
});
