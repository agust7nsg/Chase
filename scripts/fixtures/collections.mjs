import assert from 'node:assert/strict';
export function collectionFixtures() {
 const rows=new Map(),receipts=new Map();const state={rows,receipts,writes:0,offline:false};
 state.handle=async(route,user,headers)=>{
  const request=route.request(),url=new URL(request.url());
  if(!url.pathname.startsWith('/rest/v1/')) return false;
  if(state.offline){await route.abort('failed');return true;}
  assert.ok(request.headers().apikey?.startsWith('sb_publishable_'));
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return true;}
  if(user.is_anonymous){await route.fulfill({status:403,headers,json:{code:'42501'}});return true;}
  if(url.pathname.endsWith('/collection_items')){
   assert.equal(url.searchParams.get('user_id'),`eq.${user.id}`);
   const cursor=url.searchParams.get('card_id')?.slice(3);
   await route.fulfill({headers,json:[...rows.values()].filter(row=>row.user_id===user.id&&(!cursor||row.card_id>cursor)).sort((a,b)=>a.card_id.localeCompare(b.card_id)).slice(0,10)});return true;
  }
  if(url.pathname.endsWith('/rpc/collection_apply')){
   const body=request.postDataJSON();assert.equal(body.p_owner,user.id,'An account must never upload a different owner outbox.');
   const key=user.id+':'+body.p_card_id;const existing=rows.get(key);let result=receipts.get(user.id+body.p_operation);
   if(!result){
    if((existing?.revision??0)!==body.p_base_revision) result={status:'conflict',row:{cardId:body.p_card_id,revision:existing?.revision??0,item:existing?.quantity?{cardId:existing.card_id,quantity:existing.quantity,addedAt:existing.added_at,...(existing.card_snapshot?{card:existing.card_snapshot}:{})}:null}};
    else {const item=body.p_item;const row={user_id:user.id,card_id:body.p_card_id,quantity:item?.quantity??0,added_at:item?.addedAt??new Date().toISOString(),card_snapshot:item?.card??null,revision:(existing?.revision??0)+1};rows.set(key,row);state.writes++;result={status:'ok',row:{cardId:body.p_card_id,revision:row.revision,item}};}
    receipts.set(user.id+body.p_operation,result);
   }
   await route.fulfill({headers,json:result});return true;
  }
  throw new Error('Unexpected collection fixture route');
 };
 return state;
}
