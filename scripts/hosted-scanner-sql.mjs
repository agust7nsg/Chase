import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// A real embedded PostgreSQL engine, isolated from the user's Supabase project.
// Install @electric-sql/pglite@0.3.15 in a temporary tools directory and set
// CHASE_PGLITE_MODULE to its dist/index.js; see HOSTED_SCANNER.md.
const { PGlite } = await import(process.env.CHASE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const a = '12345678-1234-1234-1234-123456789abc';
const b = '12345678-1234-1234-1234-123456789def';
const digest = 'a'.repeat(64); let passed = 0;
const check = async (name, run) => { await reset(); await run(); console.log(`PASS ${++passed}: ${name}`); };
const claim = async (user = a, id = 'request-0001', hash = digest) => (await db.query('select public.scanner_claim($1::uuid,$2,$3) as value', [user,id,hash])).rows[0].value;
const status = async (user = a) => (await db.query('select public.scanner_status($1::uuid) as value', [user])).rows[0].value;
const complete = async (lease, user = a, id = 'request-0001', code = 200, body = { candidates: [] }) => (await db.query('select public.scanner_complete($1::uuid,$2,$3::uuid,$4::integer,$5::jsonb) as value', [user,id,lease,code,JSON.stringify(body)])).rows[0].value;
async function reset() {
  await db.exec(`delete from public.scanner_request_receipts; delete from public.scanner_access_grants; delete from public.scanner_global_usage;
    update public.scanner_service_limits set enabled=true,daily_request_limit=100,maximum_concurrent_requests=5;
    insert into public.scanner_access_grants(user_id,expires_at,remaining_requests) values ('${a}',now()+interval '1 day',10),('${b}',now()+interval '1 day',10);`);
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${a}'),('${b}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610210001_hosted_scanner.sql', import.meta.url), 'utf8'));
  await check('migration executes in PostgreSQL; ungranted, disabled and expired accounts have no access', async () => {
    assert.equal((await status()).status,200);
    await db.exec(`delete from public.scanner_access_grants where user_id='${a}'`); assert.equal((await claim()).body.error.code,'access_required');
    await db.exec(`update public.scanner_access_grants set expires_at=now()-interval '1 second' where user_id='${b}'`); assert.equal((await claim(b)).status,403);
  });
  await check('authenticated and anon cannot read scanner tables, grant themselves access or execute privileged RPCs', async () => {
    for (const role of ['authenticated','anon']) {
      await db.exec(`set role ${role}`);
      for (const sql of ['select * from public.scanner_access_grants', 'update public.scanner_service_limits set daily_request_limit=9999', `select public.scanner_claim('${a}','request-0001','${digest}')`, `select public.scanner_status('${a}')`]) await assert.rejects(db.exec(sql), error => error.code === '42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role'); assert.equal((await status()).status,200); await db.exec('reset role');
  });
  await check('receipt replay survives exhausted quota and debits exactly one attempt', async () => {
    await db.exec(`update public.scanner_access_grants set remaining_requests=1 where user_id='${a}'`);
    const first = await claim(); assert.ok(first.lease); assert.equal((await claim()).body.error.code,'in_progress');
    assert.deepEqual(await complete(first.lease),{ saved:true }); assert.deepEqual(await complete(first.lease),{ saved:true });
    assert.deepEqual(await claim(),{ status:200,body:{ candidates:[] } }); assert.equal((await status()).body.error.code,'account_limit');
    const saved = (await db.query('select remaining_requests from public.scanner_access_grants where user_id=$1',[a])).rows[0]; assert.equal(saved.remaining_requests,0);
  });
  await check('same request ID with another image conflicts; another account cannot retrieve that receipt', async () => {
    const first = await claim(); await complete(first.lease,a,'request-0001',200,{ candidates:[{ name:'Private fixture' }] });
    assert.equal((await claim(a,'request-0001','b'.repeat(64))).status,409); assert.ok((await claim(b)).lease);
    assert.equal((await db.query('select count(*)::integer as n from public.scanner_request_receipts')).rows[0].n,2);
  });
  await check('one account has only one active reservation and global concurrency is enforced across users', async () => {
    await db.exec('update public.scanner_service_limits set maximum_concurrent_requests=1'); const first = await claim();
    assert.equal((await claim(a,'request-0002')).body.error.code,'busy'); assert.equal((await claim(b)).body.error.code,'busy');
    await complete(first.lease); assert.ok((await claim(b)).lease);
  });
  await check('expired function lease becomes indeterminate and is never sent to the vendor again under that ID', async () => {
    const first = await claim(); await db.exec(`update public.scanner_request_receipts set lease_until=now()-interval '1 second'`);
    const retry = await claim(); assert.equal(retry.status,504); assert.equal(retry.body.error.code,'previous_attempt_unknown');
    await assert.rejects(complete(first.lease));
    await db.exec(`update public.scanner_request_receipts set created_at=now()-interval '2 seconds'`); assert.ok((await claim(a,'request-0002')).lease);
  });
  await check('daily account and global request budgets count errors and cannot be reset by app state', async () => {
    await db.exec(`update public.scanner_access_grants set daily_request_limit=1 where user_id='${a}'`);
    const first = await claim(); await complete(first.lease,a,'request-0001',503,{ error:{ code:'provider_unavailable' } });
    await db.exec(`update public.scanner_request_receipts set created_at=created_at-interval '2 seconds'`);
    assert.equal((await claim(a,'request-0002')).body.error.code,'account_limit');
    await db.exec('update public.scanner_service_limits set daily_request_limit=1'); assert.equal((await claim(b)).body.error.code,'service_limit');
  });
  await check('minimum interval, wrong settlement lease and global kill switch fail closed', async () => {
    const first = await claim(); await assert.rejects(complete(b)); await complete(first.lease);
    assert.equal((await claim(a,'request-0002')).body.error.code,'rate_limited');
    await db.exec('update public.scanner_service_limits set enabled=false'); assert.equal((await status()).body.error.code,'scanner_disabled'); assert.equal((await claim(b)).status,503);
  });
  await check('server-side access revocation preserves receipts without granting new calls', async () => {
    const first = await claim(); await complete(first.lease);
    await db.exec(`update public.scanner_access_grants set enabled=false where user_id='${a}'`); assert.equal((await claim()).status,403);
    assert.equal((await db.query('select count(*)::integer as n from public.scanner_request_receipts')).rows[0].n,1);
  });
  console.log(`Hosted scanner SQL passed: ${passed} scenarios on embedded PostgreSQL. No remote schema or real user was changed.`);
} finally { await db.close(); }
