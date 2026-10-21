import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { parseSupabaseConfig, validateCredentials, accountError } from '../src/services/auth/config';
import { ChunkedAuthStorage, type SecureKeyValue } from '../src/services/auth/secureStorage';
import { AccountService } from '../src/services/auth/accountService';
import { accountFetch } from '../src/services/auth/fetch';

const url = 'https://abcdefghijklmnopqrst.supabase.co';
const key = 'sb_publishable_fixture-only-0123456789';
function memory() {
  const values = new Map<string, string>();
  const storage: SecureKeyValue = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  return { values, storage };
}
test('client configuration accepts only public project credentials and safe HTTPS origins', () => {
  assert.equal(parseSupabaseConfig(url, key)?.project, 'abcdefghijklmnopqrst');
  for (const bad of ['sb_secret_fixture-only-123456789', 'eyJhbGciOiJIUzI1NiJ9.service_role.token', '']) assert.equal(parseSupabaseConfig(url, bad), null);
  for (const bad of ['http://abcdefghijklmnopqrst.supabase.co', url + '/rest/v1', url + '?x=1', url.replace('https://', 'https://user:password@'), 'https://example.com']) assert.equal(parseSupabaseConfig(bad, key), null);
  assert.equal(parseSupabaseConfig(undefined, key), null);
});
test('credential validation supports password managers without stripping password whitespace', () => {
  assert.equal(validateCredentials(' user@example.com ', ' correct horse battery ', true), null);
  assert.match(validateCredentials('invalid', 'long-password')!, /email/);
  assert.match(validateCredentials('user@example.com', 'short', true)!, /8/);
  assert.equal(validateCredentials('user@example.com', 'legacy'), null);
  assert.doesNotMatch(accountError({ message: 'secret upstream credentials https://private.example', code: 'unexpected' }), /secret|private/);
  assert.match(accountError({ code: 'invalid_credentials' }), /incorrect/);
});
test('large Unicode sessions survive small encrypted native value limits without plaintext fallback', async () => {
  const { storage, values } = memory();
  const secure = new ChunkedAuthStorage({ ...storage, setItem: async (key, value) => { assert.ok(Buffer.byteLength(value) <= 1024); await storage.setItem(key, value); } });
  const session = JSON.stringify({ token: 'jwt'.repeat(2000), name: '收藏者 🐉 á'.repeat(100) });
  await secure.setItem('session', session); assert.equal(await secure.getItem('session'), session);
  assert.ok(values.size > 2); await secure.removeItem('session'); assert.equal(await secure.getItem('session'), null); assert.equal(values.size, 0);
});
test('failed session writes preserve the prior manifest and can be retried safely', async () => {
  const { storage, values } = memory(); let fail = false;
  const secure = new ChunkedAuthStorage({ ...storage, setItem: async (key, value) => { if (fail && key.endsWith('.manifest')) throw new Error('Device locked'); await storage.setItem(key, value); } });
  await secure.setItem('session', 'old'); const before = new Map(values);
  fail = true; await assert.rejects(secure.setItem('session', 'new'.repeat(2000)), /locked/);
  assert.equal(await secure.getItem('session'), 'old'); assert.deepEqual(values, before);
  fail = false; await secure.setItem('session', 'new'); assert.equal(await secure.getItem('session'), 'new');
});
test('corrupt or missing session chunks are detected, while a corrupt pointer can be replaced or logged out', async () => {
  const { storage, values } = memory(); const secure = new ChunkedAuthStorage(storage);
  values.set('chase.session.manifest', '{broken'); await assert.rejects(secure.getItem('session'));
  await secure.setItem('session', 'recovered'); assert.equal(await secure.getItem('session'), 'recovered');
  const part = [...values.keys()].find(key => key !== 'chase.session.manifest')!; values.delete(part);
  await assert.rejects(secure.getItem('session'), /recovery/);
  values.set('chase.session.manifest', '{broken'); await secure.removeItem('session'); assert.equal(await secure.getItem('session'), null);
});
test('serialized refresh/logout writes cannot cross account keys or mutate local ownership', async () => {
  const { storage, values } = memory(); const secure = new ChunkedAuthStorage(storage);
  values.set('chase.prototype.v1', 'owned-cards'); values.set('chase.scan-session.v1', 'pending-cards');
  await Promise.all([secure.setItem('session', 'first'), secure.setItem('session', 'second'), secure.setItem('other-user', 'other')]);
  assert.equal(await secure.getItem('session'), 'second'); await secure.removeItem('session');
  assert.equal(await secure.getItem('other-user'), 'other'); assert.equal(values.get('chase.prototype.v1'), 'owned-cards'); assert.equal(values.get('chase.scan-session.v1'), 'pending-cards');
});
test('account fetch bounds abort-ignorant headers and body reads and supports no-content logout', async () => {
  const never = () => new Promise<Response>(() => {});
  await assert.rejects(accountFetch(never, 5)(url), /interrupted/);
  const body = new Response(new ReadableStream({ start() {} }));
  await assert.rejects(accountFetch(async () => body, 5)(url), /interrupted/);
  assert.equal((await accountFetch(async () => new Response(null, { status: 204 }))(url)).status, 204);
  const signal = new AbortController(); signal.abort(); await assert.rejects(accountFetch(never, 5)(url, { signal: signal.signal }), /interrupted/);
});

const user = { id: '12345678-1234-1234-1234-123456789abc', aud: 'authenticated', role: 'authenticated', email: 'collector@example.com', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [] };
const jwt = () => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url'), 'fixture_signature'].join('.');
function fixture(confirm = false) {
  const { storage, values } = memory(); const calls: string[] = []; const exchanges: { code_verifier: string }[] = []; let invalid = false;
  const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture-refresh', user });
  const client = createClient(url, key, { auth: { storage, storageKey: 'fixture-session', autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' }, global: { fetch: async (input, options) => {
    const request = String(input); calls.push(new URL(request).pathname);
    if (invalid) return Response.json({ code: 'invalid_credentials', message: 'Invalid login credentials' }, { status: 400, headers: { 'x-supabase-api-version': '2024-01-01' } });
    if (request.includes('/signup')) return Response.json(confirm ? user : session());
    if (request.includes('/token')) { if (new URL(request).searchParams.get('grant_type') === 'pkce') exchanges.push(JSON.parse(String(options?.body))); return Response.json(session()); }
    if (request.endsWith('/user')) { assert.ok(options?.headers); return Response.json(user); }
    if (request.includes('/logout')) return new Response(null, { status: 204 });
    if (request.endsWith('/recover')) return Response.json({});
    throw new Error('Unexpected account endpoint');
  } } });
  return { account: new AccountService(client), calls, values, exchanges, invalid: (value = true) => { invalid = value; } };
}
test('real Supabase SDK signs in, verifies the server user, restores and logs out without changing collection keys', async () => {
  const run = fixture(); run.values.set('chase.prototype.v1', 'collection'); run.values.set('chase.scan-session.v1', 'pending');
  assert.equal(await run.account.current(), null);
  await run.account.signIn(user.email, 'valid-password'); assert.equal((await run.account.current())?.id, user.id);
  assert.ok(run.calls.includes('/auth/v1/user')); assert.ok(run.values.has('fixture-session'));
  await run.account.signOut(); assert.equal(await run.account.current(), null);
  assert.equal(run.values.get('chase.prototype.v1'), 'collection'); assert.equal(run.values.get('chase.scan-session.v1'), 'pending');
});
test('registration requiring email confirmation never pretends the user is signed in', async () => {
  const run = fixture(true);
  assert.equal(await run.account.signUp(user.email, 'valid-password', 'chase://auth/callback'), true);
  assert.equal(await run.account.current(), null); assert.equal(run.values.has('fixture-session'), false);
});
test('invalid credentials and account network failures remain recoverable', async () => {
  const run = fixture(); run.invalid(); await assert.rejects(run.account.signIn(user.email, 'wrong-password'), { code: 'invalid_credentials' });
  assert.equal(await run.account.current(), null);
  run.invalid(false); await run.account.signIn(user.email, 'valid-password'); assert.equal((await run.account.current())?.id, user.id);
});
test('a PKCE email callback is exchanged once even if the callback route repeats', async () => {
  const run = fixture(); await run.account.client.auth.initialize();
  run.values.set('fixture-session-code-verifier', JSON.stringify('fixture-verifier/recovery'));
  const [first, second] = await Promise.all([run.account.completeRedirect('valid-fixture-code-12345'), run.account.completeRedirect('valid-fixture-code-12345')]);
  assert.equal(first, true); assert.equal(second, true); assert.equal(run.calls.filter(path => path.endsWith('/token')).length, 1);
  await assert.rejects(run.account.completeRedirect('invalid/code'));
});
test('confirmed registration uses the server session while a rejected cached identity is never shown as valid', async () => {
  const run = fixture();
  assert.equal(await run.account.signUp(user.email, 'valid-password', 'chase://auth/callback'), false);
  assert.equal((await run.account.current())?.id, user.id);
  run.invalid(); await assert.rejects(run.account.current(), { code: 'invalid_credentials' });
});
test('overlapping email links use their own PKCE flow slot instead of the most recent verifier', async () => {
  const run = fixture(); await run.account.client.auth.initialize();
  run.values.set('fixture-session-flow-older1234-code-verifier', JSON.stringify('old-verifier/recovery'));
  run.values.set('fixture-session-flow-newer1234-code-verifier', JSON.stringify('new-verifier'));
  run.values.set('fixture-session-code-verifier', JSON.stringify('new-verifier'));
  assert.equal(await run.account.completeRedirect('valid-old-email-code', 'older1234'), true);
  assert.equal(run.exchanges[0].code_verifier, 'old-verifier');
  assert.equal(run.values.get('fixture-session-flow-newer1234-code-verifier'), JSON.stringify('new-verifier'));
  await assert.rejects(run.account.completeRedirect('valid-code-12345', '../invalid-flow'));
});
