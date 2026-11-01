import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.CHASE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const a='12345678-1234-1234-1234-123456789abc',b='12345678-1234-1234-1234-123456789def',op='12345678-1234-1234-1234-123456789aaa';
const hash='a'.repeat(64),proofHash='b'.repeat(64); let passed=0;
const check=async(name,run)=>{await run();console.log(`PASS ${++passed}: ${name}`);};
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
 grant usage on schema auth to authenticated,anon;
 insert into auth.users(id) values ('${a}'),('${b}');`);
 for (const name of ['202610210001_hosted_scanner.sql','202611010001_collection_sync.sql','202611010002_account_deletion.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await check('migration is additive and repeatable without deleting accounts',async()=>{
  await db.exec(await readFile(new URL('../supabase/migrations/202611010002_account_deletion.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select * from auth.users')).rows.length,2);
 });
 await check('anonymous and app-authenticated roles cannot read or forge deletion receipts',async()=>{
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);
   for(const sql of ['select * from public.account_deletion_receipts',`select public.account_deletion_find('${op}')`,`select public.account_deletion_begin('${op}','${hash}','${proofHash}')`,`select public.account_deletion_complete('${op}','${hash}','${proofHash}')`]) await assert.rejects(db.exec(sql),e=>e.code==='42501');
   await db.exec('reset role');
  }
 });
 await check('only service role can create and replay matching hashed recovery intent',async()=>{
  await db.exec('set role service_role');
  const begin=()=>db.query('select public.account_deletion_begin($1::uuid,$2,$3) as receipt',[op,hash,proofHash]);
  assert.equal((await begin()).rows[0].receipt.state,'pending');assert.equal((await begin()).rows[0].receipt.state,'pending');
  await assert.rejects(db.query('select public.account_deletion_begin($1::uuid,$2,$3)',[op,hash,'c'.repeat(64)]));
  await assert.rejects(db.query('select public.account_deletion_complete($1::uuid,$2,$3)',[op,hash,'c'.repeat(64)]));
  await db.exec('reset role');
 });
 await check('Auth user removal cascades its collection, outbox receipts and scan records only',async()=>{
  for(const owner of [a,b]){
   await db.query("insert into public.collection_items(user_id,card_id,quantity,added_at,revision) values ($1,'base1-4',2,now(),1)",[owner]);
   await db.query("insert into public.collection_operation_receipts(user_id,operation_id,payload,result) values ($1,$2,'{}','{}')",[owner,op]);
   await db.query("insert into public.scanner_access_grants(user_id,expires_at,remaining_requests) values ($1,now()+interval '1 day',10)",[owner]);
   await db.query("insert into public.scanner_request_receipts(user_id,request_id,image_sha256) values ($1,'request-fixture',$2)",[owner,hash]);
  }
  await db.exec('insert into public.scanner_global_usage(usage_date,attempts) values (current_date,7)');
  // Isolated PostgreSQL fixture stands in for Admin Auth hard delete; never touches Supabase.
  await db.query('delete from auth.users where id=$1',[a]);
  for(const table of ['collection_items','collection_operation_receipts','scanner_access_grants','scanner_request_receipts']){
   const rows=(await db.query(`select user_id from public.${table}`)).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,b);
  }
  assert.equal((await db.query('select attempts from public.scanner_global_usage')).rows[0].attempts,7);
  assert.equal((await db.query('select * from public.scanner_service_limits')).rows.length,1);
 });
 await check('private recovery survives user deletion and confirmation remains idempotent',async()=>{
  await db.exec('set role service_role');
  for(let i=0;i<2;i++) await db.query('select public.account_deletion_complete($1::uuid,$2,$3)',[op,hash,proofHash]);
  const result=(await db.query('select public.account_deletion_find($1::uuid) as receipt',[op])).rows[0].receipt;
  assert.equal(result.state,'deleted');assert.ok(!JSON.stringify(result).includes(a));
  await db.exec('reset role');
 });
 await check('expired recovery proofs are rejected and purged on lookup',async()=>{
  await db.query("update public.account_deletion_receipts set expires_at=now()-interval '1 second' where operation_id=$1",[op]);
  await db.exec('set role service_role');
  await assert.rejects(db.query('select public.account_deletion_complete($1::uuid,$2,$3)',[op,hash,proofHash]));
  assert.equal((await db.query('select public.account_deletion_find($1::uuid) as receipt',[op])).rows[0].receipt,null);
 });
 console.log(`Account deletion SQL passed: ${passed} isolated PostgreSQL scenarios. No real accounts deleted.`);
} finally {await db.close();}
