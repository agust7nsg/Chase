import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { AccountService } from '../src/services/auth/accountService';
import { accountError } from '../src/services/auth/config';
import { authCallbackParameters, googleRedirectUri, OAuthError, parseGoogleCallback, runGoogleOAuth, type OAuthBrowser } from '../src/services/auth/oauth';

const origin = 'https://abcdefghijklmnopqrst.supabase.co';
const redirect = 'chase://auth/callback?provider=google';
const code = 'fixture-google-code-123456';
function fixture(guest = false) {
  const values = new Map<string, string>([['chase.prototype.v1', 'owned'], ['chase.scan-session.v1', 'pending']]);
  const calls: { url: URL; body: Record<string, unknown>; headers: Headers }[] = [];
  const id = '12345678-1234-1234-1234-123456789abc';
  let anonymous = guest; let linkingError = false; let offline = false; let invalidIdentity = false;
  const user = () => ({ id, email: anonymous ? undefined : 'collector@example.com', is_anonymous: anonymous, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: { full_name: 'Google Collector' } });
  const session = () => ({ access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.'), token_type: 'bearer', refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() });
  if (guest) values.set('oauth-session', JSON.stringify(session()));
  const client = createClient(origin, 'sb_publishable_fixture-only-0123456789', {
    auth: { storageKey: 'oauth-session', storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    global: { fetch: async (input, init) => {
      if (offline) throw new Error('offline');
      const url = new URL(String(input)); const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body, headers: new Headers(init?.headers) });
      if (url.pathname.endsWith('/user/identities/authorize')) {
        if (linkingError) return Response.json({ code: 'identity_already_exists', message: 'private upstream info' }, { status: 422, headers: { 'x-supabase-api-version': '2024-01-01' } });
        return Response.json({ url: `${origin}/auth/v1/authorize?provider=google` });
      }
      if (url.pathname.endsWith('/token')) { anonymous = false; return Response.json(session()); }
      if (url.pathname.endsWith('/user')) return invalidIdentity ? Response.json({ code: 'bad_jwt', message: 'invalid' }, { status: 401 }) : Response.json(user());
      throw new Error('Unexpected OAuth fixture endpoint');
    } },
  });
  const account = new AccountService(client);
  return { account, values, calls, id, setLinkingError: () => { linkingError = true; }, setOffline: () => { offline = true; }, rejectIdentity: () => { invalidIdentity = true; } };
}
const successBrowser: OAuthBrowser = { redirectUri: () => redirect, open: async () => ({ type: 'success', url: `${redirect}&code=${code}` }) };

test('Google OAuth prepares a PKCE Google authorization with minimal scopes and no client secret', async () => {
  const run = fixture(); const result = await run.account.startGoogle(redirect); const url = new URL(result.url);
  assert.equal(url.origin, origin); assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('redirect_to'), redirect); assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.ok(url.searchParams.get('code_challenge')); assert.ok(result.flowId);
  assert.equal(url.searchParams.get('scopes'), 'openid email profile'); assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(url.searchParams.get('client_secret'), null); assert.equal(run.calls.length, 0);
});
test('a scanner guest links Google in place and keeps owned cards, pending scans and UUID', async () => {
  const run = fixture(true); const before = run.values.get('oauth-session');
  assert.equal(await runGoogleOAuth(run.account, successBrowser), 'success');
  const link = run.calls.find(call => call.url.pathname.endsWith('/user/identities/authorize'))!;
  assert.ok(link); assert.match(link.headers.get('authorization')!, /^Bearer /);
  assert.equal(link.url.searchParams.get('code_challenge_method'), 's256');
  assert.equal((await run.account.identity())?.id, run.id);
  assert.equal((await run.account.current())?.displayName, 'Google Collector');
  assert.notEqual(run.values.get('oauth-session'), before);
  assert.equal(run.values.get('chase.prototype.v1'), 'owned'); assert.equal(run.values.get('chase.scan-session.v1'), 'pending');
  assert.equal(run.calls.filter(call => call.url.searchParams.get('grant_type') === 'pkce').length, 1);
});
test('Google cancel/dismiss never exchanges a code, consumes a scan or destroys the guest session', async () => {
  for (const type of ['cancel', 'dismiss'] as const) {
    const run = fixture(true); const before = run.values.get('oauth-session');
    assert.equal(await runGoogleOAuth(run.account, { redirectUri: () => redirect, open: async () => ({ type }) }), type);
    assert.equal(run.values.get('oauth-session'), before); assert.ok(!run.calls.some(call => call.url.pathname.endsWith('/token')));
    assert.equal(run.values.get('chase.scan-session.v1'), 'pending');
  }
});
test('web uses a full page redirect; a cold callback exchanges the persisted verifier once', async () => {
  const run = fixture(); let flowId: string | undefined;
  const browser: OAuthBrowser = { redirectUri: () => redirect, open: async () => ({ type: 'redirecting' }) };
  assert.equal(await runGoogleOAuth({ ...run.account, startGoogle: async uri => { const result = await run.account.startGoogle(uri); flowId = result.flowId; return result; }, completeRedirect: () => { throw new Error('Must not exchange before redirect'); } }, browser), 'redirecting');
  const resumed = new AccountService(run.account.client);
  await Promise.all([resumed.completeRedirect(code, flowId), resumed.completeRedirect(code, flowId)]);
  await resumed.completeRedirect(code); // Router repeats the native browser callback without a flow ID.
  await assert.rejects(resumed.completeRedirect(code, 'different-flow-123'));
  assert.equal(run.calls.filter(call => call.url.pathname.endsWith('/token')).length, 1);
  assert.ok(run.calls.find(call => call.url.pathname.endsWith('/token'))?.body.code_verifier);
  assert.equal((await resumed.current())?.id, run.id);
});
test('existing Google identity is a recoverable link error; switching accounts is an explicit separate action', async () => {
  const run = fixture(true); run.setLinkingError(); const before = run.values.get('oauth-session');
  await assert.rejects(run.account.startGoogle(redirect), error => accountError(error).includes('Use existing Google account'));
  assert.equal(run.values.get('oauth-session'), before);
  const existing = await run.account.startGoogle(redirect, true);
  assert.equal(new URL(existing.url).pathname, '/auth/v1/authorize');
  assert.equal(run.calls.filter(call => call.url.pathname.endsWith('/user/identities/authorize')).length, 1);
  assert.equal(run.values.get('chase.prototype.v1'), 'owned');
});
test('a completed code still requires a server-verified user before displaying the account', async () => {
  const run = fixture(); await runGoogleOAuth(run.account, successBrowser); run.rejectIdentity();
  await assert.rejects(run.account.current());
});
test('offline guest linking fails without clearing pending scans or its persisted session', async () => {
  const run = fixture(true); const before = run.values.get('oauth-session'); run.setOffline();
  await assert.rejects(run.account.startGoogle(redirect));
  assert.equal(run.values.get('oauth-session'), before); assert.equal(run.values.get('chase.scan-session.v1'), 'pending');
});
test('callbacks reject wrong origins, bearer-token URLs, malformed codes and arrays', () => {
  for (const url of [`https://evil.example/auth/callback?provider=google&code=${code}`, `${redirect}&code=short`, `${redirect}&code=${code}#access_token=secret`, `chase://other/callback?provider=google&code=${code}`, `chase://auth/callback?code=${code}`]) {
    assert.throws(() => parseGoogleCallback(url, redirect));
  }
  assert.throws(() => authCallbackParameters({ code: [code, code] }));
  assert.throws(() => authCallbackParameters({ code, sb_flow_id: '../unsafe' }));
  assert.deepEqual(parseGoogleCallback(`${redirect}&code=${code}&sb_flow_id=valid-flow-123`, redirect), { code, flowId: 'valid-flow-123' });
});
test('OAuth provider failures are sanitized and access denial remains recoverable', async () => {
  for (const params of ['&error=access_denied&error_description=secret-upstream', '#error_code=identity_already_exists&error_description=secret-upstream']) {
    assert.throws(() => parseGoogleCallback(redirect + params, redirect), error => !accountError(error).includes('secret-upstream'));
  }
  assert.match(accountError(new OAuthError('access_denied')), /canceled/);
  assert.match(accountError(new OAuthError('provider_disabled')), /Supabase/);
});
test('Expo Go fails before starting OAuth; builds and web have explicit correct return URLs', async () => {
  assert.equal(googleRedirectUri('android', false), redirect); assert.equal(googleRedirectUri('ios', false), redirect);
  assert.equal(googleRedirectUri('web', false, 'http://localhost:8085'), 'http://localhost:8085/auth/callback?provider=google');
  assert.throws(() => googleRedirectUri('web', false, 'http://untrusted.example'));
  const run = fixture();
  await assert.rejects(runGoogleOAuth(run.account, { ...successBrowser, redirectUri: () => googleRedirectUri('android', true) }), error => accountError(error).includes('Expo Go'));
  assert.equal(run.values.has('oauth-session-code-verifier'), false); assert.equal(run.calls.length, 0);
});
