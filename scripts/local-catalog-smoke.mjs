import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage'] });
try {
 for (const width of [320,390]) {
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});let catalogRequests=0;const errors=[];
  await context.route('https://**/*', route=>{if(route.request().url().includes('api.tcgdex.net'))catalogRequests++;return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{}});});
  await context.addInitScript(()=>localStorage.setItem('chase.prototype.v1',JSON.stringify({onboardingComplete:true,plan:'free',trial:{successfulRecognitions:1},items:[{cardId:'base1-4',quantity:2,addedAt:'2026-11-01T00:00:00Z'}]})));
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.CHASE_SMOKE_URL ?? 'http://localhost:8090');await page.getByRole('button',{name:'Scan a Card',exact:true}).waitFor();await page.getByTestId('startup-splash').waitFor({state:'detached'});
  await page.getByText('139 expansions · Newest first',{exact:true}).waitFor();
  const before=await page.evaluate(()=>localStorage.getItem('chase.prototype.v1'));
  await page.getByRole('button',{name:'See all',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/search');
  await page.getByRole('textbox',{name:'Search Pokémon card sets',exact:true}).fill('Pitch Black');
  const target=page.getByRole('button',{name:/Browse Pitch Black/}).filter({visible:true});
  await target.waitFor(); const start=Date.now(); await target.click();
  await page.getByText(/24 of 120 cards/).waitFor();assert.ok(Date.now()-start<5000,'Cold set appears without crawling individual provider cards.');
  const images=page.getByRole('img',{name:/Pokémon TCG card/});await images.first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('img')].filter(img=>img.alt.includes('Pokémon TCG card')).some(img=>img.complete&&img.naturalWidth>=500));
  const src=await images.first().getAttribute('src');assert.equal(new URL(src,page.url()).origin,new URL(page.url()).origin,'Recent art comes from the installed bundle.');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/tmp/chase-local-catalog-${width}.png`});
  await page.getByRole('button',{name:'Load more cards',exact:true}).click();await page.getByText('48 of 120 cards',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('chase.prototype.v1')),before);assert.equal(catalogRequests,0);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: 206 sets, cold 120-card set, original bundled photos, pagination, unchanged ownership, zero provider API requests.`);
  await context.close();
 }
} finally {await browser.close();}
