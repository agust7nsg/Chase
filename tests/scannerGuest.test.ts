import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createScannerSession } from '../src/services/auth/scannerSession';
import { AccountService } from '../src/services/auth/accountService';
import { configureHostedScanner } from '../scripts/configure-hosted-scanner.mjs';

const id = '12345678-1234-1234-1234-123456789abc';
const root = 'https://abcdefghijklmnopqrst.supabase.co';
function guestFixture(disabled = false) {
  const values = new Map<string, string>(); const calls: { path: string; method: string; body: unknown }[] = [];
  let guest = true; let confirmed = false; let metadata: Record<string,unknown> = {};
  const user = () => ({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: guest,
    ...(confirmed ? { email: 'collector@example.com', email_confirmed_at: '2026-10-21T00:00:00Z' } : {}),
    created_at: '2026-10-21T00:00:00Z', app_metadata: {}, user_metadata: metadata });
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture-signature'].join('.');
  const sdk = () => createClient(root, 'sb_publishable_guest-fixture-only', {
    auth: { flowType:'pkce', autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'guest-fixture',
      storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key,value); }, removeItem: key => { values.delete(key); } } },
    global: { fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path.endsWith('/signup')) {
        if (disabled) return Response.json({ code: 'anonymous_provider_disabled', msg: 'Private server configuration' }, { status: 422, headers: { 'x-supabase-api-version': '2024-01-01' } });
        return Response.json({ access_token: token, refresh_token: 'guest-fixture-refresh', expires_in: 3600, token_type: 'bearer', user: user() });
      }
      if (path.endsWith('/token')) return Response.json({ access_token:token, refresh_token:'guest-fixture-refresh', expires_in:3600, token_type:'bearer', user:user() });
      if (path.endsWith('/user')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (guest && body.password) return Response.json({ code:'validation_failed',msg:'Verify email first' },{ status:422 });
        metadata = { ...metadata,...body.data };
        return Response.json(user());
      }
      throw new Error('Unexpected guest endpoint');
    } },
  });
  return { client: sdk(), restore: sdk, calls, values, confirm: () => { guest = false; confirmed = true; } };
}

test('scanner creates one authenticated guest for overlapping requests, reuses it and restores it after restart', async () => {
  const run = guestFixture(); const session = createScannerSession(run.client);
  const [a,b,c] = await Promise.all([session(),session(),session()]);
  assert.equal(a.user.id,id); assert.equal(a.user.is_anonymous,true); assert.equal(a.access_token,b.access_token); assert.equal(b.access_token,c.access_token);
  assert.equal(run.calls.filter(call => call.path.endsWith('/signup')).length,1);
  await session(); await createScannerSession(run.restore())();
  assert.equal(run.calls.filter(call => call.path.endsWith('/signup')).length,1);
  assert.equal(await new AccountService(run.client).current(),null, 'A technical guest must not appear as a registered account.');
});

test('registration upgrades the guest UUID in place without a new signup, quota identity or collection mutation', async () => {
  const run = guestFixture(); const session = createScannerSession(run.client); await session();
  run.values.set('chase.prototype.v1','collection'); run.values.set('chase.scan-session.v1','pending');
  const account = new AccountService(run.client);
  assert.equal(await account.signUp('collector@example.com','long-password','chase://auth/callback'),true);
  const update = run.calls.find(call => call.method === 'PUT');
  assert.equal((update?.body as { email: string }).email,'collector@example.com');
  assert.equal((update?.body as { password?: string }).password,undefined, 'Passwords cannot be set before guest email verification.');
  assert.equal((await session()).user.id,id); assert.equal(run.calls.filter(call => call.path.endsWith('/signup')).length,1);
  run.confirm();
  assert.equal(await account.completeRedirect('valid-guest-upgrade-code'),true, 'Verification must route to password setup.');
  await account.updatePassword('verified-password');
  assert.equal((await account.current())?.id,id);
  assert.equal((await run.client.auth.getSession()).data.session?.user.user_metadata.chase_password_setup,false);
  assert.equal(run.values.get('chase.prototype.v1'),'collection'); assert.equal(run.values.get('chase.scan-session.v1'),'pending');
});

test('registered sessions are reused; unavailable guest Auth is recoverable and cannot silently fabricate a session', async () => {
  const run = guestFixture(); run.confirm(); const session = createScannerSession(run.client); await session();
  assert.equal((await session()).user.is_anonymous,false); assert.equal((await new AccountService(run.client).current())?.id,id);
  assert.equal(run.calls.length,2);
  const disabled = guestFixture(true); const reconnect = createScannerSession(disabled.client);
  await assert.rejects(reconnect(),/Guest scanning is not enabled/); await assert.rejects(reconnect(),/Guest scanning is not enabled/);
  assert.equal(disabled.values.has('guest-fixture'),false);
});

test('deployment configures automatic access and guest Auth on the fixed project, preserving existing base schema', async () => {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  await configureHostedScanner({ accessToken: 'deployment-fixture',baseMigration:'BASE',accessMigration:'ADDITIVE',simulationMigration:'SIMULATION', fetcher: async (input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer deployment-fixture');
    calls.push({ url:String(input),method:init?.method ?? '',body:JSON.parse(String(init?.body)) });
    return Response.json(calls.length === 1 ? [{ installed:true,automatic_access:false }] : calls.length < 5 ? [] : { external_anonymous_users_enabled:true, security_manual_linking_enabled:true });
  } });
  assert.equal(calls.length,5); assert.ok(calls.every(call => call.url.startsWith('https://api.supabase.com/v1/projects/vzjekkgyrdxzlhaupnrw/')));
  assert.deepEqual(calls[1].body,{ query:'ADDITIVE' }); assert.deepEqual(calls[2].body,{ query:'SIMULATION' });
  assert.match(String(calls[3].body.query),/pro_simulation_until = null/);
  assert.equal(calls[4].method,'PATCH');
  assert.deepEqual(calls[4].body,{ external_anonymous_users_enabled:true, security_manual_linking_enabled:true });
});

test('deployment fails closed on insufficient scopes without leaking remote response bodies or credentials', async () => {
  let calls = 0;
  await assert.rejects(configureHostedScanner({ accessToken:'private-fixture',baseMigration:'BASE',accessMigration:'ADDITIVE',simulationMigration:'SIMULATION', fetcher: async () => {
    calls++; return Response.json({ private:'upstream-private' },{ status:403 });
  } }),error => {
    assert.ok(error instanceof Error);
    assert.match(error.message,/token permissions/); assert.doesNotMatch(error.message,/private-fixture|upstream-private/); return true;
  });
  assert.equal(calls,1);
});

test('test deployment opens a bounded window without rerunning the old success backfill; release deployment closes it', async () => {
  for (const enabled of [true,false]) {
    const bodies: Record<string,unknown>[]=[];
    await configureHostedScanner({ accessToken:'deployment-fixture',baseMigration:'BASE',accessMigration:'OLD_BACKFILL',simulationMigration:'SIMULATION',enableProSimulation:enabled,
      fetcher:async (_input,init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json(bodies.length===1 ? [{ installed:true,automatic_access:true }] : bodies.length===4 ? { external_anonymous_users_enabled:true,security_manual_linking_enabled:true } : []);
      },
    });
    assert.equal(bodies.length,4); assert.deepEqual(bodies[1],{ query:'SIMULATION' });
    assert.match(String(bodies[2].query),enabled ? /now\(\) \+ interval '7 days'/ : /pro_simulation_until = null/);
    assert.ok(!bodies.some(body=>body.query==='OLD_BACKFILL'));
  }
});
