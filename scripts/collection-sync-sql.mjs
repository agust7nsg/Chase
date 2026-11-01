import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.CHASE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const a='12345678-1234-1234-1234-123456789abc', b='12345678-1234-1234-1234-123456789def', guest='12345678-1234-1234-1234-123456789aaa';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item=quantity=>({cardId:'base1-4',quantity,addedAt:'2026-11-01T00:00:00Z'});
let passed=0;
const check=async(name,run)=>{await run();console.log(`PASS ${++passed}: ${name}`);};
async function as(user, anonymous=false,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,is_anonymous:anonymous})]);
  await db.exec(`set role ${role}`);
}
async function apply(owner,operation,revision,entry,card='base1-4') {
 return (await db.query('select public.collection_apply($1::uuid,$2::uuid,$3,$4::bigint,$5::jsonb) as result',[owner,operation,card,revision,entry===null?null:JSON.stringify(entry)])).rows[0].result;
}
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
 grant usage on schema auth to authenticated,anon;
 insert into auth.users values ('${a}',false),('${b}',false),('${guest}',true);`);
 const migration=await readFile(new URL('../supabase/migrations/202611010001_collection_sync.sql',import.meta.url),'utf8');
 await db.exec(migration); await db.exec(migration);
 await check('the additive migration can be applied twice without deleting ownership',async()=>{
  await as(a); const saved=await apply(a,id(1),0,item(2));assert.equal(saved.status,'ok');assert.equal(saved.row.revision,1);
 });
 await check('identical operation retries are idempotent and changed payload replay is rejected',async()=>{
  const saved=await apply(a,id(1),0,item(2));assert.equal(saved.row.revision,1);
  await assert.rejects(apply(a,id(1),0,item(3)),e=>e.code==='22023');
  assert.equal((await db.query('select quantity from public.collection_items')).rows[0].quantity,2);
 });
 await check('owner B cannot read or mutate A, even by passing A to the RPC',async()=>{
  await as(b);assert.equal((await db.query('select * from public.collection_items')).rows.length,0);
  await assert.rejects(apply(a,id(2),1,item(8)),e=>e.code==='42501');
  await apply(b,id(3),0,item(9));assert.equal((await db.query('select quantity from public.collection_items')).rows[0].quantity,9);
 });
 await check('direct app-role writes and private receipt reads are denied',async()=>{
  await as(a);
  for(const sql of ["delete from public.collection_items",'update public.collection_items set quantity=900','select * from public.collection_operation_receipts']) await assert.rejects(db.exec(sql),e=>e.code==='42501');
 });
 await check('stale revisions return a conflict without changing cloud ownership',async()=>{
  const conflict=await apply(a,id(4),0,item(7));assert.equal(conflict.status,'conflict');assert.equal(conflict.row.item.quantity,2);
  assert.equal((await db.query('select revision from public.collection_items')).rows[0].revision,1);
  const chosen=await apply(a,id(5),1,item(7));assert.equal(chosen.status,'ok');assert.equal(chosen.row.revision,2);
 });
 await check('deletions retain a versioned tombstone and an old offline write cannot resurrect it',async()=>{
  const deleted=await apply(a,id(6),2,null);assert.equal(deleted.row.item,null);assert.equal(deleted.row.revision,3);
  assert.equal((await apply(a,id(7),1,item(5))).status,'conflict');
  assert.equal((await db.query('select quantity from public.collection_items')).rows[0].quantity,0);
 });
 await check('guest authenticated JWTs and anon roles cannot use account collection storage',async()=>{
  await as(guest,true);assert.equal((await db.query('select * from public.collection_items')).rows.length,0);
  await assert.rejects(apply(guest,id(8),0,item(1)),e=>e.code==='42501');
  await as(a,false,'anon'); await assert.rejects(apply(a,id(9),0,item(1)),e=>e.code==='42501');
 });
 await check('malformed quantities and mismatched variant snapshots are rejected before receipts are created',async()=>{
  await as(a);
  for(const entry of [{...item(0)},{...item(-1)},{...item(1.5)},{...item(1000001)}]) await assert.rejects(apply(a,id(10),3,entry));
  await assert.rejects(apply(a,id(11),0,{...item(1),cardId:'tcgdex:en:sv1-1:holo',card:{id:'other'}},'tcgdex:en:sv1-1:holo'));
 });
 console.log(`Collection SQL passed: ${passed} scenarios on real embedded PostgreSQL. No remote schema was changed.`);
} finally {await db.close();}
