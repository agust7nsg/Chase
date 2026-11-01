import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';
import { collectionFixtures } from './fixtures/collections.mjs';
const url=process.env.CHASE_SMOKE_URL??'http://localhost:8085';
const browser=await chromium.launch({executablePath:process.env.CHASE_BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const owner='12345678-1234-1234-1234-123456789abc';
const key='chase.auth.vzjekkgyrdxzlhaupnrw.v1',privateKey='chase.auth.vzjekkgyrdxzlhaupnrw.deletion.v1';
const seed={onboardingComplete:true,plan:'free',trial:{successfulRecognitions:1},items:[{cardId:'base1-4',quantity:2,addedAt:'2026-11-01T00:00:00Z'}]};
const pending={version:1,id:'deletion-pending',freeRecognitionUsed:false,items:[]};
const user={id:owner,email:'collector@example.com',is_anonymous:false,aud:'authenticated',role:'authenticated',created_at:'2026-11-01T00:00:00Z',app_metadata:{provider:'google'},user_metadata:{},identities:[{provider:'google'}]};
const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'oauth',timestamp:Math.floor(Date.now()/1000)}]})).toString('base64url'),'fixture'].join('.');
const button=(page,name)=>page.getByRole('button',{name,exact:true}).filter({visible:true});
let passed=0;const errors=[];const contexts=[];
const check=async(name,run)=>{await run();console.log(`PASS ${++passed}: ${name}`);};
async function device(mode='success'){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(context);await installTCGdexFixtures(context);
 const backend=collectionFixtures();backend.rows.set(owner+':base1-4',{user_id:owner,card_id:'base1-4',quantity:7,added_at:'2026-11-01T00:00:00Z',revision:1,card_snapshot:null});
 const state={mode,deleted:false,calls:[],firstBody:null,currentUser:user,logouts:0};
 await context.route('https://*.supabase.co/**',async route=>{
  const request=route.request(),parsed=new URL(request.url());const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(parsed.pathname.endsWith('/delete-account')){
   const body=request.postDataJSON();state.calls.push(body);assert.equal(body.ownerId,owner);assert.equal(body.confirmation,'DELETE');assert.match(body.proof,/^[a-f0-9]{64}$/);
   if(mode==='reauth')return route.fulfill({status:403,headers,json:{error:{code:'reauth_required',notDeleted:true}}});
   state.deleted=true;backend.rows.clear();
   if(mode==='lost'&&state.calls.length===1){state.firstBody=body;return route.abort('failed');}
   if(state.firstBody)assert.deepEqual(body,state.firstBody,'Recovery must reuse the same durable operation.');
   return route.fulfill({headers,json:{deleted:true,ownerId:owner,operationId:body.operationId}});
  }
  if(parsed.pathname.endsWith('/user')){const gone=state.deleted&&state.currentUser.id===owner;return route.fulfill({status:gone?401:200,headers,json:gone?{message:'deleted',code:'user_not_found'}:state.currentUser});}
  if(parsed.pathname.endsWith('/logout')){state.logouts++;return route.fulfill({status:204,headers});}
  if(await backend.handle(route,state.currentUser,headers))return;
  throw new Error('Unexpected deletion fixture endpoint '+parsed.pathname);
 });
 await context.addInitScript(({seed,pending,user,token,key})=>{
  if(localStorage.getItem('delete-fixture-initialized'))return;
  localStorage.setItem('delete-fixture-initialized','1');localStorage.setItem('chase.prototype.v1',JSON.stringify(seed));localStorage.setItem('chase.scan-session.v1',JSON.stringify(pending));
  localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
 },{seed,pending,user,token,key});
 const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/profile');await page.getByText(user.email,{exact:true}).filter({visible:true}).waitFor();await page.getByTestId('startup-splash').waitFor({state:'detached'});
 await page.waitForFunction(owner=>JSON.parse(localStorage.getItem('chase.prototype.v1'))?.collectionSync?.accounts[owner]?.items[0]?.quantity===7,owner);
 return {page,state,context};
}
async function open(run){await run.page.getByText('Delete Account',{exact:true}).filter({visible:true}).click();await run.page.getByRole('heading',{name:'Delete Account',exact:true}).waitFor();}
async function confirm(run){await run.page.getByRole('textbox',{name:'Type DELETE to confirm'}).fill('DELETE');await button(run.page,'Permanently delete account').click();}
async function unchanged(run){const data=await run.page.evaluate(()=>({raw:JSON.parse(localStorage.getItem('chase.prototype.v1')),pending:JSON.parse(localStorage.getItem('chase.scan-session.v1'))}));assert.deepEqual(data.raw.items,seed.items);assert.deepEqual(data.raw.trial,seed.trial);assert.deepEqual(data.pending,pending);}
try{
 await check('cancel and incorrect confirmation never submit a deletion',async()=>{
  const run=await device();await open(run);assert.equal(await button(run.page,'Permanently delete account').isDisabled(),true);
  await run.page.getByRole('textbox',{name:'Type DELETE to confirm'}).fill('delete');assert.equal(await button(run.page,'Permanently delete account').isDisabled(),true);
  await button(run.page,'Cancel').click();assert.equal(run.state.calls.length,0);await unchanged(run);await run.context.close();
 });
 await check('confirmed deletion removes only account cache, signs out and preserves guest + Organize',async()=>{
  const run=await device();await open(run);await confirm(run);await run.page.getByRole('heading',{name:'Account deleted',exact:true}).waitFor();
  const stored=await run.page.evaluate(({key,privateKey,owner})=>({session:localStorage.getItem(key),job:localStorage.getItem(privateKey),account:JSON.parse(localStorage.getItem('chase.prototype.v1')).collectionSync?.accounts[owner]}),{key,privateKey,owner});
  assert.equal(stored.session,null);assert.equal(stored.job,null);assert.equal(stored.account,undefined);assert.equal(run.state.calls.length,1);await unchanged(run);await run.context.close();
 });
 await check('lost reply survives restart, retains local account until confirmation and replays one intent',async()=>{
  const run=await device('lost');await open(run);await confirm(run);await run.page.getByText('Deletion could not be confirmed.',{exact:false}).waitFor();
  assert.equal(await run.page.evaluate(owner=>JSON.parse(localStorage.getItem('chase.prototype.v1')).collectionSync.accounts[owner].items[0].quantity,owner),7);
  await run.page.reload();await button(run.page,'Check or retry deletion').waitFor();await run.page.getByTestId('startup-splash').waitFor({state:'detached'});
  await button(run.page,'Check or retry deletion').click();await run.page.getByRole('heading',{name:'Account deleted',exact:true}).waitFor();assert.equal(run.state.calls.length,2);await unchanged(run);await run.context.close();
 });
 await check('stale authentication gives reauthentication instructions without removing local cards',async()=>{
  const run=await device('reauth');await open(run);await confirm(run);await button(run.page,'Sign in again with Google').waitFor();
  assert.equal(run.state.deleted,false);assert.ok(await run.page.evaluate(key=>localStorage.getItem(key),privateKey));await unchanged(run);await run.context.close();
 });
 await check('recovering account A deletion never signs out or removes the selected account B',async()=>{
  const run=await device('lost');await open(run);await confirm(run);await run.page.getByText('Deletion could not be confirmed.',{exact:false}).waitFor();
  const other='12345678-1234-1234-1234-123456789bbb';run.state.currentUser={...user,id:other,email:'other@example.com'};
  const otherToken=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:other,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await run.page.evaluate(({key,user,token})=>localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'other-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{key,user:run.state.currentUser,token:otherToken});
  await run.page.reload();await button(run.page,'Check or retry deletion').waitFor();await run.page.getByTestId('startup-splash').waitFor({state:'detached'});
  await run.page.waitForFunction(other=>Boolean(JSON.parse(localStorage.getItem('chase.prototype.v1')).collectionSync?.accounts[other]),other);
  await button(run.page,'Check or retry deletion').click();await run.page.getByRole('heading',{name:'Account deleted',exact:true}).waitFor();
  const saved=await run.page.evaluate(({key,other,owner})=>({user:JSON.parse(localStorage.getItem(key))?.user.id,accounts:JSON.parse(localStorage.getItem('chase.prototype.v1')).collectionSync.accounts,other,owner}),{key,other,owner});
  assert.equal(saved.user,other);assert.ok(saved.accounts[other]);assert.equal(saved.accounts[owner],undefined);assert.equal(run.state.logouts,0);await unchanged(run);await run.context.close();
 });
 assert.deepEqual(errors,[]);console.log(`Account deletion browser passed: ${passed} fixture scenarios. No real account requests.`);
}finally{await Promise.allSettled(contexts.map(c=>c.close()));await browser.close();}
