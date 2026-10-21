import assert from 'node:assert/strict';
import test from 'node:test';
import { createHostedScanner } from '../supabase/functions/_shared/hostedScanner';
import { failure, type HostedScannerStore, type ScannerOutcome } from '../supabase/functions/_shared/hostedProtocol';
import { supabaseScannerDependencies } from '../supabase/functions/_shared/supabaseScannerStore';
import { ScannerTransportError } from '../supabase/functions/_shared/transportTypes';
import { hostedScannerConfig, isHostedScanner } from '../src/services/cardsight/config';
import { CardSightRecognitionService } from '../src/services/cardsight/client';

const userId = '12345678-1234-1234-1234-123456789abc';
const otherUser = '12345678-1234-1234-1234-123456789def';
const jwt = 'eyJhbGciOiJFUzI1NiJ9.fixture-signature.valid-session';
const jpeg = btoa(String.fromCharCode(255,216,255,224,0,16,255,217));
const candidate = { providerId: 'vendor-card', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35', language: 'en', finish: 'normal' as const, confidenceTier: 'High' as const };
function request(id = 'hosted-request-0001', options: { token?: string; origin?: string; extra?: Record<string, unknown>; image?: string } = {}) {
  return new Request('https://abcdefghijklmnopqrst.supabase.co/functions/v1/cardsight-scanner/recognize', { method: 'POST',
    headers: { Authorization: `Bearer ${options.token ?? jwt}`, 'Content-Type': 'application/json', ...(options.origin ? { Origin: options.origin } : {}) },
    body: JSON.stringify({ requestId: id, image: { mimeType: 'image/jpeg', base64: options.image ?? jpeg }, ...options.extra }) });
}
function fixture() {
  const receipts = new Map<string, { digest: string; outcome?: ScannerOutcome }>(); let calls = 0; let remaining = 10; let completeFails = false;
  const store: HostedScannerStore = {
    status: async () => ({ status: 200, body: { ready: true, mode: 'supabase-hosted' } }),
    claim: async (user, id, digest) => {
      const key = `${user}:${id}`; const previous = receipts.get(key);
      if (previous) return previous.digest !== digest ? failure(409, 'request_id_conflict') : previous.outcome ?? failure(429, 'in_progress');
      if (!remaining) return failure(429, 'account_limit');
      if ([...receipts].some(([id, value]) => id.startsWith(user + ':') && !value.outcome)) return failure(429, 'busy');
      remaining--; receipts.set(key, { digest }); return { lease: userId };
    },
    complete: async (user, id, _lease, outcome) => { if (completeFails) throw new Error('Database unavailable'); receipts.get(`${user}:${id}`)!.outcome = outcome; },
  };
  const options = { configured: true, authenticate: async (token: string) => token === jwt ? userId : null, store,
    recognize: async () => { calls++; return { candidates: [candidate] }; } };
  return { options, receipts, calls: () => calls, remaining: () => remaining, failComplete: () => { completeFails = true; } };
}

test('hosted configuration derives only this project HTTPS endpoint and never a vendor/local URL', () => {
  const config = hostedScannerConfig('https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_test-only-12345');
  assert.ok(isHostedScanner(config)); assert.equal(config?.proxyUrl, 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/cardsight-scanner');
  assert.equal(hostedScannerConfig('https://api.cardsight.ai', 'sb_publishable_test-only-12345'), null);
  assert.equal(hostedScannerConfig('http://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_test-only-12345'), null);
  assert.equal(hostedScannerConfig('https://abcdefghijklmnopqrst.supabase.co', 'sb_secret_fixture-only-12345'), null);
});
test('hosted endpoint verifies bearer identity before health, storage or paid transport; no Origin is required on native', async () => {
  const run = fixture(); const handler = createHostedScanner(run.options);
  for (const token of ['anonymous-publishable-key', 'forged-token', '']) assert.equal((await handler(request(undefined, { token }))).status, 401);
  assert.equal(run.calls(), 0); assert.equal(run.receipts.size, 0);
  const health = new Request('https://scanner.test/health', { headers: { Authorization: `Bearer ${jwt}` } });
  assert.equal((await handler(health)).status, 200); assert.equal(run.calls(), 0);
  assert.equal((await handler(request())).status, 200); assert.equal(run.calls(), 1);
});
test('browser origins are allowlisted while preflight performs no authentication or vendor request', async () => {
  const run = fixture(); const handler = createHostedScanner({ ...run.options, authenticate: async () => { throw new Error('Must not authenticate preflight'); }, allowedOrigins: ['https://chase.example'] });
  assert.equal((await handler(request(undefined, { origin: 'https://evil.example' }))).status, 403);
  const response = await handler(new Request('https://scanner.test/recognize', { method: 'OPTIONS', headers: { Origin: 'https://chase.example' } }));
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), 'https://chase.example'); assert.equal(run.calls(), 0);
});
test('client supplied ownership, Pro flags, URLs, large bodies and invalid images cannot reach the provider', async () => {
  const run = fixture(); const handler = createHostedScanner(run.options);
  for (const extra of [{ userId: otherUser }, { plan: 'pro' }, { imageUrl: 'http://127.0.0.1/private' }]) assert.equal((await handler(request(undefined, { extra }))).status, 400);
  for (const image of ['invalid', btoa('not an image'), `data:image/jpeg;base64,${jpeg}`]) assert.equal((await handler(request(undefined, { image }))).status, 400);
  const tooLarge = request(); tooLarge.headers.set('Content-Length', '999999999'); assert.equal((await handler(tooLarge)).status, 413);
  assert.equal(run.calls(), 0); assert.equal(run.remaining(), 10);
});
test('a stalled upload is cancelled before allocating any vendor attempt', async () => {
  const run = fixture(); let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const upload = new Request('https://scanner.test/recognize', { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body, duplex: 'half' } as RequestInit);
  const response = await createHostedScanner({ ...run.options, inputTimeoutMs: 15 })(upload);
  assert.equal(response.status,400); assert.equal(cancelled,true); assert.equal(run.calls(),0); assert.equal(run.remaining(),10);
});
test('two function instances share durable receipts; a response replay never charges or calls the vendor twice', async () => {
  const run = fixture(); const first = createHostedScanner(run.options); const second = createHostedScanner(run.options);
  assert.equal((await first(request())).status, 200);
  assert.deepEqual(await (await second(request())).json(), { candidates: [candidate] });
  assert.equal(run.calls(), 1); assert.equal(run.remaining(), 9);
  assert.equal((await second(request(undefined, { image: btoa(String.fromCharCode(255,216,255,225,3,4)) }))).status, 409);
});
test('concurrent replicas never call CardSight for a replay or second in-flight presentation', async () => {
  const run = fixture(); let finish!: (value: { candidates: typeof candidate[] }) => void;
  const options = { ...run.options, recognize: () => new Promise<{ candidates: typeof candidate[] }>(resolve => { finish = resolve; }) };
  const inFlight = createHostedScanner(options)(request());
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await createHostedScanner(options)(request())).status, 429);
  assert.equal((await createHostedScanner(options)(request('second-request-0002'))).status, 429);
  finish({ candidates: [candidate] }); assert.equal((await inFlight).status, 200); assert.equal(run.receipts.size, 1);
});
test('quota and access decisions fail closed before the vendor, regardless of app Pro simulation', async () => {
  const run = fixture(); const store = { ...run.options.store, claim: async () => failure(403, 'access_required') };
  assert.equal((await createHostedScanner({ ...run.options, store })(request())).status, 403); assert.equal(run.calls(), 0);
  const failed = { ...store, claim: async () => { throw new Error('Storage failure with private details'); } };
  assert.equal((await createHostedScanner({ ...run.options, store: failed })(request())).status, 503); assert.equal(run.calls(), 0);
});
test('timeout releases the handler, aborts upstream and persists only the timeout, even if provider finishes late', async () => {
  const run = fixture(); let aborted = false; let finish!: (value: { candidates: typeof candidate[] }) => void;
  const handler = createHostedScanner({ ...run.options, providerTimeoutMs: 15, recognize: async (_bytes, signal) => {
    signal.addEventListener('abort', () => { aborted = true; }); return new Promise(resolve => { finish = resolve; });
  } });
  assert.equal((await handler(request())).status, 504); assert.equal(aborted, true);
  finish({ candidates: [candidate] }); await new Promise(resolve => setTimeout(resolve, 1));
  const replay = await createHostedScanner(run.options)(request()); assert.equal(replay.status, 504); assert.equal(run.calls(), 0);
});
test('database settlement failure never reports a successful result and leaves a replay protected', async () => {
  const run = fixture(); run.failComplete(); const handler = createHostedScanner(run.options);
  const response = await handler(request()); assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'receipt_pending');
  assert.equal((await createHostedScanner(run.options)(request())).status, 429); assert.equal(run.calls(), 1);
});
test('classified vendor failures and raw private messages are sanitized and durably replayable', async () => {
  for (const code of ['provider_auth', 'provider_rejected', 'provider_rate_limited', 'multiple_cards'] as const) {
    const run = fixture(); const handler = createHostedScanner({ ...run.options, recognize: async () => { throw new ScannerTransportError(code); } });
    const response = await handler(request()); const value = await response.json(); assert.equal(value.error.code, code);
    assert.equal((await handler(request())).status, response.status);
    assert.doesNotMatch(JSON.stringify(value), /apiKey|secret|token/);
  }
});
test('the server gets identity from Auth, not decoded claims or supplied user metadata, and sends no credentials upstream', async () => {
  const seen: string[] = [];
  const dependency = supabaseScannerDependencies('https://abcdefghijklmnopqrst.supabase.co', 'server-role-fixture-only', async (input, init) => {
    seen.push(String(input)); assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${jwt}`);
    return Response.json({ id: userId, role: 'authenticated', is_anonymous: false, email_confirmed_at: '2026-10-21T00:00:00Z', user_metadata: { plan: 'pro' } });
  });
  assert.equal(await dependency.authenticate(jwt), userId); assert.deepEqual(seen, ['https://abcdefghijklmnopqrst.supabase.co/auth/v1/user']);
  const guest = supabaseScannerDependencies('https://abcdefghijklmnopqrst.supabase.co', 'server-key', async () => Response.json({ id: userId, role: 'authenticated', is_anonymous: true }));
  assert.equal(await guest.authenticate(jwt), userId, 'Verified guest sessions get automatic Free access.');
  for (const user of [{ id: userId, role: 'authenticated' }, { id: otherUser, role: 'anon', email_confirmed_at: '2026-10-21T00:00:00Z' }, { id: userId, role: 'anon', is_anonymous: true }]) {
    const invalid = supabaseScannerDependencies('https://abcdefghijklmnopqrst.supabase.co', 'server-key', async () => Response.json(user)); assert.equal(await invalid.authenticate(jwt), null);
  }
});
test('receipt RPCs carry only the verified user ID, fingerprint and whitelisted results; an invalid settlement fails closed', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const dependency = supabaseScannerDependencies('https://abcdefghijklmnopqrst.supabase.co', 'server-role-fixture-only', async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    assert.equal(new Headers(init?.headers).get('apikey'), 'server-role-fixture-only');
    if (String(input).endsWith('scanner_claim')) return Response.json({ lease: userId });
    return Response.json({ saved: false });
  });
  assert.deepEqual(await dependency.store.claim(userId, 'request-test-123', 'a'.repeat(64)), { lease: userId });
  await assert.rejects(dependency.store.complete(userId, 'request-test-123', userId, { status: 200, body: { candidates: [candidate] } }));
  assert.deepEqual(calls[0].body, { p_user_id: userId, p_request_id: 'request-test-123', p_digest: 'a'.repeat(64) });
  assert.doesNotMatch(JSON.stringify(calls), /base64|image\/jpeg/);
});
test('hosted recognition resolves the current JWT for every card and preserves the real catalog identity/finish', async () => {
  let token = jwt; const requests: string[] = [];
  const card = { id: 'tcgdex:en:xy12-35:normal', catalogIdentity: { provider: 'tcgdex' as const, language: 'en', id: 'xy12-35', variant: 'normal' }, name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108', variant: 'Normal' as const, imageKey: 'pikachu', marketPrice: null };
  const service = new CardSightRecognitionService({ proxyUrl: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/cardsight-scanner',
    credentials: async () => ({ token, apiKey: 'sb_publishable_fixture-only' }), catalog: { listSets: async () => [{ id: 'xy12', name: 'Evolutions' }], getSet: async () => ({ id: 'xy12', name: 'Evolutions', cards: [{ id: 'xy12-35', name: 'Pikachu', localId: '35' }] }), getVariants: async () => [card] },
    fetch: async (_input, init) => { requests.push(new Headers(init?.headers).get('Authorization')!); assert.equal(new Headers(init?.headers).get('apikey'), 'sb_publishable_fixture-only'); return Response.json({ candidates: [candidate] }); } });
  const image = { base64: jpeg, mimeType: 'image/jpeg' as const, width: 600, height: 825 };
  assert.equal((await service.recognize({ image })).id, card.id); token = jwt + '-refreshed'; assert.equal((await service.recognize({ image })).variant, 'Normal');
  assert.deepEqual(requests, [`Bearer ${jwt}`, `Bearer ${token}`]);
});
