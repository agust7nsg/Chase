import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountDeletion, DeletionError, submitAccountDeletion, type DeletionJob } from '../src/services/auth/deletion';
import { createAccountDeletion, deletionHash, type DeletionDependencies, type DeletionReceipt } from '../supabase/functions/_shared/accountDeletion';
import { deletionDependencies } from '../supabase/functions/_shared/accountDeletionStore';
const ownerId = '12345678-1234-1234-1234-123456789abc';
const operationId = '12345678-1234-1234-1234-123456789def';
const proof = 'a'.repeat(64);
const job: DeletionJob = { ownerId, operationId, proof, status: 'pending' };
const now = Date.now();
const token = (age = 0, sub = ownerId, method = 'oauth') => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub, exp: now / 1000 + 3600, amr: [{ method, timestamp: now / 1000 - age }] })).toString('base64url')}.fixture`;
function fixture() {
  let receipt: DeletionReceipt | null = null; let exists = true; let removals = 0; let verified = 0;
  const deps: DeletionDependencies = {
    now: () => now,
    authenticate: async () => { verified++; return { id: ownerId, anonymous: false, google: true }; },
    find: async () => receipt,
    begin: async (_id, ownerHash, proofHash) => receipt = { ownerHash, proofHash, state: 'pending', createdAt: new Date(now).toISOString() },
    complete: async () => { receipt!.state = 'deleted'; },
    removeUser: async () => { removals++; exists = false; }, userExists: async () => exists,
  };
  const request = (bearer: string | null = token(), data: unknown = { ...job, status: undefined, confirmation: 'DELETE' }, origin?: string) => new Request('https://test.invalid/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
  return { deps, request, handler: () => createAccountDeletion(deps), receipt: () => receipt, removals: () => removals, verified: () => verified, exists: () => exists };
}
test('deletion requires exact confirmation, verified registered owner and fresh OAuth', async () => {
  for (const variation of ['missing','anonymous','other','invalid','stale','password','forged','google-missing']) {
    const f = fixture(); let bearer: string | null = token(); let data: unknown;
    if (variation === 'missing') bearer = null;
    if (variation === 'anonymous') f.deps.authenticate = async () => ({ id: ownerId, anonymous: true, google: true });
    if (variation === 'other') f.deps.authenticate = async () => ({ id: operationId, anonymous: false, google: true });
    if (variation === 'invalid') data = { ownerId, operationId, proof, confirmation: 'YES' };
    if (variation === 'stale') bearer = token(601);
    if (variation === 'password') bearer = token(0, ownerId, 'password');
    if (variation === 'forged') f.deps.authenticate = async () => null;
    if (variation === 'google-missing') f.deps.authenticate = async () => ({ id: ownerId, anonymous: false, google: false });
    const response = await f.handler()(f.request(bearer, data));
    assert.ok(response.status >= 400, variation); assert.equal(f.removals(), 0, variation); assert.equal(f.receipt(), null);
  }
});
test('fresh verified OAuth hard-deletes exactly the reviewed owner, then confirms absence', async () => {
  const f = fixture(); const response = await f.handler()(f.request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true, ownerId, operationId });
  assert.equal(f.exists(), false); assert.equal(f.removals(), 1); assert.equal(f.verified(), 1); assert.equal(f.receipt()?.state, 'deleted');
  assert.equal(f.receipt()?.proofHash, await deletionHash(proof)); assert.ok(!JSON.stringify(f.receipt()).includes(ownerId));
});
test('lost success replies recover using the durable proof without a deleted login', async () => {
  const f = fixture(); await f.handler()(f.request());
  f.deps.authenticate = async () => { throw new Error('Deleted session cannot authenticate'); };
  assert.equal((await f.handler()(f.request(null))).status, 200); assert.equal(f.removals(), 1);
});
test('proof or owner mismatch cannot use an authorized deletion receipt', async () => {
  const f = fixture(); await f.handler()(f.request());
  for (const changed of [{ proof: 'b'.repeat(64) }, { ownerId: operationId }]) assert.equal((await f.handler()(f.request(null, { ownerId, operationId, proof, confirmation: 'DELETE', ...changed }))).status, 403);
  assert.equal(f.removals(), 1);
});
test('lost admin delete reply can be recovered by checking absence, without deleting again', async () => {
  const f = fixture(); const remove = f.deps.removeUser;
  f.deps.removeUser = async id => { await remove(id); throw new Error('reply lost'); };
  assert.equal((await f.handler()(f.request())).status, 503);
  assert.equal((await f.handler()(f.request(null))).status, 200); assert.equal(f.removals(), 1);
});
test('provider failure never confirms or logs its body; retry retains authorized intent', async () => {
  const f = fixture(); f.deps.removeUser = async () => { throw new Error('private-provider-secret'); };
  const response = await f.handler()(f.request()); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private-provider'));
  assert.equal(f.receipt()?.state, 'pending'); assert.equal(f.exists(), true);
});
test('old pending intent cannot initiate a new deletion without reauthentication', async () => {
  const f = fixture(); f.deps.removeUser = async () => { throw new Error('offline'); }; await f.handler()(f.request());
  f.deps.now = () => now + 16 * 60000;
  const response = await f.handler()(f.request(null)); assert.equal(response.status, 403); assert.equal((await response.json()).error.notDeleted, false); assert.equal(f.removals(), 0);
});
test('untrusted origins, malformed and oversized requests do not reach Auth or deletion', async () => {
  const f = fixture();
  assert.equal((await f.handler()(f.request(token(), undefined, 'https://evil.invalid'))).status, 403);
  assert.equal((await f.handler()(f.request(token(), { ownerId, operationId, proof, confirmation: 'DELETE', extra: 'x'.repeat(3000) }))).status, 400);
  assert.equal((await f.handler()(new Request('https://test.invalid'))).status, 405);
  assert.equal(f.verified(), 0); assert.equal(f.removals(), 0);
});
function local() {
  const data = new Map<string,string>(); let fail = false;
  const storage = { getItem: async (key: string) => data.get(key) ?? null, setItem: async (key: string, value: string) => { if (fail) throw new Error('disk full'); data.set(key, value); }, removeItem: async (key: string) => { data.delete(key); } };
  return { data, storage, controller: new AccountDeletion(storage, 'private', () => {}), fail: () => { fail = true; } };
}
test('local intent must be durable before any destructive request', async () => {
  const l = local(); l.fail(); let calls = 0;
  await assert.rejects(l.controller.run(ownerId, () => job, async () => { calls++; })); assert.equal(calls, 0); assert.equal(l.controller.job, null);
});
test('ambiguous response persists same operation and proof across restart', async () => {
  const l = local(); await assert.rejects(l.controller.run(ownerId, () => job, async () => { throw new Error('offline'); }));
  const next = new AccountDeletion(l.storage, 'private', () => {}); await next.load(); assert.deepEqual(next.job, job);
  await next.run(ownerId, () => { throw new Error('Must not create another operation'); }, async sent => { assert.deepEqual(sent, job); });
  assert.equal(next.job?.status, 'confirmed'); assert.equal(JSON.parse(l.data.get('private')!).status, 'confirmed'); await next.finish(); assert.equal(l.data.size, 0);
});
test('reauthentication failures keep the durable intent without claiming cancellation or success', async () => {
  const l = local(); await assert.rejects(l.controller.run(ownerId, () => job, async () => { throw new DeletionError('reauth_required', true); }));
  assert.deepEqual(l.controller.job, job); assert.equal(l.data.size, 1); await assert.rejects(l.controller.finish());
});
test('different account and simultaneous submissions cannot replace an active deletion', async () => {
  const l = local(); let release!: () => void;
  const first = l.controller.run(ownerId, () => job, () => new Promise<void>(r => { release = r; }));
  await new Promise(r => setTimeout(r, 0)); await assert.rejects(l.controller.run(ownerId, () => job, async () => {})); release(); await first;
  await assert.rejects(l.controller.run(operationId, () => ({ ...job, ownerId: operationId }), async () => {})); assert.equal(l.controller.job?.ownerId, ownerId);
});
test('confirmed deletion can finish local cleanup after restart without another network delete', async () => {
  const l = local(); await l.controller.run(ownerId, () => job, async () => {});
  const next = new AccountDeletion(l.storage, 'private', () => {}); await next.load(); await next.run(ownerId, () => job, async () => { throw new Error('Should not call'); }); await next.finish();
  assert.equal(next.job, null);
});
test('client accepts only exact owner/operation confirmation and never sends admin credentials', async () => {
  const config = { url: 'https://vzjekkgyrdxzlhaupnrw.supabase.co', project: 'vzjekkgyrdxzlhaupnrw', publishableKey: 'sb_publishable_fixture' };
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, config.url + '/functions/v1/delete-account'); assert.equal((init!.headers as Record<string,string>).apikey, config.publishableKey);
    assert.equal((init!.headers as Record<string,string>).Authorization, 'Bearer fixture');
    assert.equal(JSON.parse(init!.body as string).confirmation, 'DELETE');
    return Response.json({ deleted: true, ownerId: operationId, operationId });
  };
  await assert.rejects(submitAccountDeletion(config, job, 'fixture', fetcher), /invalid_response/);
});
test('server-only transport uses a verified user bearer, and hard deletion targets Admin Auth', async () => {
  const calls: string[] = [];
  const deps = deletionDependencies('https://vzjekkgyrdxzlhaupnrw.supabase.co', 'server-only-key', async (url, init) => {
    calls.push(String(url)); const headers = init!.headers as Record<string,string>;
    assert.equal(headers.apikey, 'server-only-key');
    if (String(url).endsWith('/auth/v1/user')) { assert.equal(headers.Authorization, 'Bearer client-jwt'); return Response.json({ id: ownerId, role: 'authenticated', identities: [{ provider: 'google' }] }); }
    assert.equal(headers.Authorization, 'Bearer server-only-key');
    if (init!.method === 'DELETE') { assert.deepEqual(JSON.parse(init!.body as string), { should_soft_delete: false }); return Response.json({ id: ownerId }); }
    return new Response(null, { status: 404 });
  });
  assert.equal((await deps.authenticate('client-jwt'))?.google, true); await deps.removeUser(ownerId); assert.equal(await deps.userExists(ownerId), false);
  assert.ok(calls.every(url => !url.includes('server-only-key')));
});

test('an old pending intent can resume after a fresh verified Google login', async () => {
  const f = fixture(); const remove = f.deps.removeUser;
  f.deps.removeUser = async () => { throw new Error('offline'); }; await f.handler()(f.request());
  f.deps.now = () => now + 16 * 60000; f.deps.removeUser = remove;
  assert.equal((await f.handler()(f.request(token(-16*60)))).status, 200); assert.equal(f.removals(), 1);
});
test('Admin success with a still-existing user never reports successful deletion', async () => {
  const f = fixture(); f.deps.removeUser = async () => {};
  assert.equal((await f.handler()(f.request())).status, 503); assert.equal(f.receipt()?.state, 'pending');
});
