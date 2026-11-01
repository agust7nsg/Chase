import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';
import { collectionFixtures } from './fixtures/collections.mjs';
const url=process.env.CHASE_SMOKE_URL??'http://localhost:8085';
const browser=await chromium.launch({executablePath:process.env.CHASE_BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const backend=collectionFixtures(), errors=[];const contexts=[];
const a='12345678-1234-1234-1234-123456789abc',b='12345678-1234-1234-1234-123456789def';
const seed={onboardingComplete:true,plan:'free',trial:{successfulRecognitions:0},items:[{cardId:'base1-4',quantity:2,addedAt:'2026-11-01T00:00:00Z'}]};
const pending={version:1,id:'sync-pending',freeRecognitionUsed:false,items:[{id:'scan-copy',operationId:'scan-operation',cardId:'base1-4',name:'Charizard',imageKey:'charizard',setName:'Base Set',collectorNumber:'4/102',variant:'Holo',quantity:3,identifiedAt:'2026-11-01T00:00:00Z',ambiguity:'confirmed',priceState:'unavailable',price:null}]};
const button=(page,name)=>page.getByRole('button',{name,exact:true}).filter({visible:true});
let passed=0;const check=async(name,run)=>{await run();console.log(`PASS ${++passed}: ${name}`);};
async function device(){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(context);await installTCGdexFixtures(context);
 const state={offline:false,user:{id:a,email:'collector@example.com',is_anonymous:false,aud:'authenticated',created_at:'2026-11-01T00:00:00Z',app_metadata:{},user_metadata:{full_name:'Collector'},identities:[]}};
 const token=()=>['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:state.user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
 await context.route('https://*.supabase.co/**',async route=>{
  if(state.offline)return route.abort('failed');const request=route.request(),parsed=new URL(request.url());
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  if(parsed.pathname==='/auth/v1/authorize'){const callback=new URL(parsed.searchParams.get('redirect_to'));callback.searchParams.set('code','sync-google-code-'+Date.now());return route.fulfill({status:302,headers:{location:callback.href}});}
  if(await backend.handle(route,state.user,headers))return;
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(parsed.pathname.endsWith('/token'))return route.fulfill({headers,json:{access_token:token(),refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:state.user}});
  if(parsed.pathname.endsWith('/user'))return route.fulfill({headers,json:state.user});
  if(parsed.pathname.endsWith('/logout'))return route.fulfill({status:204,headers});
  throw new Error('Unexpected fixture endpoint '+parsed.pathname);
 });
 await context.addInitScript(({seed,pending})=>{if(!localStorage.getItem('chase.prototype.v1'))localStorage.setItem('chase.prototype.v1',JSON.stringify(seed));if(!localStorage.getItem('chase.scan-session.v1'))localStorage.setItem('chase.scan-session.v1',JSON.stringify(pending));},{seed,pending});
 const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
 return {context,page,state};
}
async function login(run){await run.page.goto(`${url}/account?section=signin`);await button(run.page,'Continue with Google').click();await run.page.getByText(run.state.user.email,{exact:true}).filter({visible:true}).waitFor();await button(run.page,'Sync now').waitFor();}
async function waitQuantity(page,owner,n){await page.waitForFunction(({owner,n})=>{const d=JSON.parse(localStorage.getItem('chase.prototype.v1'));return (d.collectionSync?.accounts[owner]?.items.find(i=>i.cardId==='base1-4')?.quantity??0)===n;},{owner,n});}
async function waitSynced(page,owner){await page.waitForFunction(owner=>{const d=JSON.parse(localStorage.getItem('chase.prototype.v1'));return d.collectionSync?.accounts[owner]?.lastSynced&&d.collectionSync.accounts[owner].pending.length===0;},owner);}
async function sync(run){await run.page.goto(`${url}/profile`);await button(run.page,'Sync now').click();}
async function setQuantity(run,n){await run.page.goto(`${url}/card/base1-4`);const current=await run.page.evaluate(owner=>JSON.parse(localStorage.getItem('chase.prototype.v1')).collectionSync.accounts[owner].items.find(i=>i.cardId==='base1-4').quantity,run.state.user.id);for(let q=current;q<n;q++){await button(run.page,'Add one Charizard copy').click();await waitQuantity(run.page,run.state.user.id,q+1);}}
let left,right;
try{
 left=await device();right=await device();
 await check('sign-in keeps guest cards separate and requires an explicit import',async()=>{
  await login(left);await left.page.getByText('2 guest copies on this device',{exact:true}).waitFor();assert.equal(backend.writes,0);await waitQuantity(left.page,a,0);
  await button(left.page,'Import guest cards').click();await waitQuantity(left.page,a,2);await waitSynced(left.page,a);assert.equal(backend.rows.get(a+':base1-4').quantity,2);
 });
 await check('a second device restores the account collection without importing its guest inventory',async()=>{
  await login(right);await waitQuantity(right.page,a,2);await button(right.page,'Keep guest cards separate').click();await waitSynced(right.page,a);assert.equal(backend.rows.get(a+':base1-4').quantity,2);
  assert.deepEqual(await right.page.evaluate(()=>JSON.parse(localStorage.getItem('chase.prototype.v1')).items),seed.items);
 });
 await check('offline edits remain durable and sync once after reconnecting',async()=>{
  right.state.offline=true;await setQuantity(right,3);await right.page.reload();await waitQuantity(right.page,a,3);assert.equal(backend.rows.get(a+':base1-4').quantity,2);
  right.state.offline=false;await sync(right);await waitSynced(right.page,a);assert.equal(backend.rows.get(a+':base1-4').quantity,3);await sync(left);await waitQuantity(left.page,a,3);
 });
 await check('conflicting edits on two devices require a deliberate quantity choice',async()=>{
  left.state.offline=true;right.state.offline=true;await setQuantity(left,4);await setQuantity(right,5);
  left.state.offline=false;await sync(left);await waitSynced(left.page,a);right.state.offline=false;await sync(right);
  await right.page.getByText('This device: 5 · Cloud: 4',{exact:true}).waitFor();await button(right.page,'Keep my quantity for Charizard').click();await waitSynced(right.page,a);
  assert.equal(backend.rows.get(a+':base1-4').quantity,5);await sync(left);await waitQuantity(left.page,a,5);
 });
 await check('accepting a cloud quantity requires confirmation and cancel preserves local ownership',async()=>{
  left.state.offline=true;right.state.offline=true;await setQuantity(left,6);await setQuantity(right,7);
  left.state.offline=false;await sync(left);await waitSynced(left.page,a);right.state.offline=false;await sync(right);
  await right.page.getByText('This device: 7 · Cloud: 6',{exact:true}).waitFor();
  await button(right.page,'Use cloud quantity for Charizard').click();await right.page.getByText('Replace the local quantity with the cloud quantity?',{exact:true}).waitFor();
  await button(right.page,'Cancel').click();await waitQuantity(right.page,a,7);
  await button(right.page,'Use cloud quantity for Charizard').click();await button(right.page,'Confirm cloud quantity for Charizard').click();await waitQuantity(right.page,a,6);await waitSynced(right.page,a);
 });
 await check('logout restores guest inventory and another account never receives the previous account cards',async()=>{
  await button(right.page,'Log Out').click();await right.page.getByText('Your collection and pending scans stay on this device.',{exact:true}).waitFor();await button(right.page,'Log Out').click();await button(right.page,'Sign In').waitFor();
  assert.equal(await right.page.evaluate(()=>JSON.parse(localStorage.getItem('chase.prototype.v1')).items[0].quantity),2);
  right.state.user={...right.state.user,id:b,email:'second@example.com'};await login(right);await waitQuantity(right.page,b,0);assert.equal(backend.rows.has(b+':base1-4'),false);
  assert.equal(backend.rows.get(a+':base1-4').quantity,6);
 });
 await check('Organize remains local until explicit save, then inventory/outbox/receipts commit once',async()=>{
  assert.equal(backend.rows.get(a+':base1-4').quantity,6);
  await left.page.goto(`${url}/organize`);await button(left.page,'Save all to Collection').click();await waitQuantity(left.page,a,9);
  await sync(left);await waitSynced(left.page,a);assert.equal(backend.rows.get(a+':base1-4').quantity,9);
  await left.page.reload();await waitQuantity(left.page,a,9);await sync(left);await waitSynced(left.page,a);assert.equal(backend.rows.get(a+':base1-4').quantity,9);
 });
 await check('an expired session can reopen the cached account offline without falling back to guest ownership',async()=>{
  const offline=await device();await login(offline);await waitQuantity(offline.page,a,9);await waitSynced(offline.page,a);
  offline.state.offline=true;
  await offline.page.evaluate(()=>{const key='chase.auth.vzjekkgyrdxzlhaupnrw.v1';const session=JSON.parse(localStorage.getItem(key));session.expires_at=Math.floor(Date.now()/1000)-5;localStorage.setItem(key,JSON.stringify(session));});
  await offline.page.reload();await offline.page.getByText('Offline account',{exact:true}).waitFor();
  await offline.page.getByRole('tab',{name:/Collection/}).click();await offline.page.getByText('Account collection',{exact:true}).waitFor();
  await waitQuantity(offline.page,a,9);assert.equal(backend.rows.get(a+':base1-4').quantity,9);
 });
 assert.deepEqual(errors,[]);console.log(`Collection sync browser passed: ${passed} scenarios. Supabase/Google responses are fixtures; no remote accounts were changed.`);
}catch(error){if(left?.page&&!left.page.isClosed())await left.page.screenshot({path:'/tmp/chase-sync-left-failure.png'}).catch(()=>{});if(right?.page&&!right.page.isClosed())await right.page.screenshot({path:'/tmp/chase-sync-right-failure.png'}).catch(()=>{});const last=contexts.at(-1)?.pages().at(-1);if(last&&!last.isClosed())console.error('Last device UI:',(await last.locator('body').innerText()).slice(-1500));console.error(error);process.exitCode=1;}
finally{for(const context of contexts)await context.close();await browser.close();}
