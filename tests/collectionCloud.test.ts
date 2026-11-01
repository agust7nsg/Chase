import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { SupabaseCollectionCloud } from '../src/services/collections/supabase';
const a='12345678-1234-1234-1234-123456789abc'; const b='12345678-1234-1234-1234-123456789def';
function fixture(timeout = 15000) {
  const calls: URL[]=[]; let identity=a; let anonymous=false; let fail=false; let hung=false;
  const rows=Array.from({length:23},(_,n)=>{const id=`tcgdex:en:fixture-${String(n).padStart(3,'0')}:normal`;return {card_id:id,quantity:1,added_at:'2026-11-01T00:00:00Z',revision:1,card_snapshot:{id,name:'Card',setName:'Set',collectorNumber:String(n),variant:'Normal',imageKey:'',marketPrice:null,catalogIdentity:{provider:'tcgdex',language:'en',id:`fixture-${String(n).padStart(3,'0')}`,variant:'normal'}}};});
  const client=createClient('https://abcdefghijklmnopqrst.supabase.co','sb_publishable_fixture_12345',{auth:{autoRefreshToken:false,persistSession:false},global:{fetch:async(input,init)=>{
    const url=new URL(String(input)); calls.push(url); if(hung) return new Promise<Response>(()=>{});
    if(url.pathname.endsWith('/user')) return Response.json({id:identity,is_anonymous:anonymous,aud:'authenticated',created_at:'2026-11-01',app_metadata:{},user_metadata:{}});
    if(fail) return Response.json({message:'private-upstream'},{status:500});
    if(url.pathname.endsWith('/collection_items')) {assert.equal(url.searchParams.get('user_id'),`eq.${a}`);const cursor=url.searchParams.get('card_id')?.slice(3);return Response.json(rows.filter(row=>!cursor||row.card_id>cursor).slice(0,10));}
    if(url.pathname.endsWith('/collection_apply')) {const body=JSON.parse(String(init?.body));assert.equal(body.p_owner,a);return Response.json({status:'ok',row:{cardId:body.p_card_id,revision:2,item:body.p_item}});}
    throw new Error('Unexpected collection endpoint');
  }}});
  // Supply a controlled valid bearer session without issuing a password/signup request.
  const session={access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:a,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture'};
  return { cloud:new SupabaseCollectionCloud(client,timeout), calls,rows, init:()=>client.auth.setSession(session), switchIdentity:()=>{identity=b;}, guest:()=>{anonymous=true;}, offline:()=>{fail=true;}, hang:()=>{hung=true;} };
}
test('Supabase collection adapter loads every keyset page and keeps exact card/finish snapshots',async()=>{
 const run=fixture();await run.init();const rows=await run.cloud.read(a);assert.equal(rows.length,23);assert.equal(run.calls.filter(url=>url.pathname.endsWith('/collection_items')).length,3);
 assert.equal(rows[0].item?.card?.catalogIdentity?.variant,'normal');assert.equal(rows[0].item?.card?.marketPrice,null);
});
test('identity mismatch and anonymous sessions cannot read or send another account outbox',async()=>{
 for(const guest of [false,true]){const run=fixture();await run.init();if(guest)run.guest();else run.switchIdentity();const before=run.calls.length;await assert.rejects(run.cloud.read(a));await assert.rejects(run.cloud.apply(a,{id:a,cardId:'base1-4',baseRevision:0,item:null}));assert.ok(run.calls.slice(before).every(url=>url.pathname.endsWith('/user')));}
});
test('collection apply includes the intended owner and stable operation ID, preserving unpriced variants',async()=>{
 const run=fixture();await run.init();const row=(await run.cloud.read(a))[0];const result=await run.cloud.apply(a,{id:b,cardId:row.cardId,baseRevision:1,item:row.item});assert.equal(result.row.item?.card?.id,row.cardId);assert.equal(result.row.item?.card?.marketPrice,null);
});
test('network or malformed catalog data fails the complete pull instead of dropping owned rows',async()=>{
 const run=fixture();await run.init();run.rows[15].card_snapshot.id='wrong-variant';await assert.rejects(run.cloud.read(a));run.offline();await assert.rejects(run.cloud.read(a),error=>error instanceof Error&&!error.message.includes('private-upstream'));
});
test('an abort-ignorant Auth SDK request cannot leave synchronization permanently busy',async()=>{
 const run=fixture(5);await run.init();run.hang();await assert.rejects(run.cloud.read(a),/timed out/);
 assert.ok(!run.calls.some(url=>url.pathname.endsWith('/collection_items')));
});
