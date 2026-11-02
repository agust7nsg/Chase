import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';
const base=process.env.CHASE_SMOKE_URL??'http://localhost:8085';
const browser=await chromium.launch({executablePath:process.env.CHASE_BROWSER_EXECUTABLE??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const network=await installTCGdexFixtures(context), images=[], errors=[];
 context.on('request',request=>{if(request.url().startsWith('https://assets.tcgdex.net/'))images.push(request.url());});
 const seed={onboardingComplete:true,plan:'free',trial:{successfulRecognitions:0},items:[]};
 await context.addInitScript(seed=>{if(!localStorage.getItem('chase.prototype.v1'))localStorage.setItem('chase.prototype.v1',JSON.stringify(seed));},seed);
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/');
 await page.waitForFunction(()=>localStorage.getItem('chase.tcgdex.v1:en:ranked-sets-price-v1/30th')!==null);
 console.log('PASS 1: startup warms the newest complete set without opening its page');
 await page.waitForFunction(()=>localStorage.getItem('chase.tcgdex.v1:en:ranked-sets-price-v1/30th-c')!==null);
 assert.ok(images.some(url=>url.includes('/30th/002/high.webp')),'Catalog artwork is prefetched before opening a set.');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('chase.prototype.v1'))),seed);
 console.log('PASS 2: artwork warms in the background and guest ownership stays unchanged');
 network.offline=true;
 await page.goto(base+'/search?setId=30th&setName=30th%20Celebration');
 await page.getByText('5 cards',{exact:true}).filter({visible:true}).waitFor();
 const before=network.requests.length;
 await page.reload();await page.getByText('5 cards',{exact:true}).filter({visible:true}).waitFor();
 assert.equal(network.requests.length,before,'A fresh persisted set opens after reload without API requests.');
 assert.deepEqual(errors,[]);assert.deepEqual(network.failures,[]);
 console.log('PASS 3: a cold reopened preloaded set renders offline without fetching its card details');
 await context.close();
} finally {await browser.close();}
