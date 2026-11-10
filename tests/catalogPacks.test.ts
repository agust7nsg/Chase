import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { CatalogPackStore, validatePack, validatePackIndex } from '../src/services/tcgdex/packs';
import { TcgDexCatalogService } from '../src/services/tcgdex';
import index from '../src/data/catalog/index.json';
import { bundledPacks } from '../src/data/catalog/loaders';
import search from '../src/data/catalog/search.json';
const now = Date.parse('2026-11-10T12:00:00Z');
const set = { id: 'test', name: 'Test Set', cardCount: { official: 2, total: 2 }, releaseDate: '2026-10-01' };
const cards = [{ id: 'test-1', localId: '1', name: 'Pikachu', variants: { normal: true, reverse: true } }, { id: 'test-2', localId: '2', name: 'Eevee', variants: { normal: true } }];
const pack = { schema: 1, language: 'en', revision: 'structural', set, cards };
const base = { schema: 1, language: 'en', revision: 'base', generatedAt: '2026-11-01T00:00:00Z', sets: [set] };
const store = (extra = {}) => new CatalogPackStore({ index: base, loaders: { test: () => structuredClone(pack) }, search: () => cards.map(c=>({...c,setId:'test'})), now: () => now, ...extra });
const offline = async () => { throw Error('No network may be required'); };
const storage = () => { const data = new Map<string,string>(); return { data, getItem: async (k:string)=>data.get(k)??null, setItem: async (k:string,v:string)=>{ assert.ok(k.startsWith('chase.catalog-packs.v1:')); data.set(k,v); } }; };

test('all 221 installed sets and every printing validate with exact stable identities', () => {
  assert.equal(index.sets.length,221); let count = 0;
  for (const set of index.sets) count += validatePack(bundledPacks[set.id](), set.id).cards.length;
  assert.equal(count,23912); assert.equal(search.length,count);
  assert.equal(new Set(search.map(c=>c.id)).size,count);
  assert.deepEqual([...index.sets].sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate)||a.id.localeCompare(b.id)),index.sets);
});
test('cold install can browse, paginate, identify and search without any HTTP requests or ownership writes', async () => {
  let calls=0; const published: string[]=[]; const cache=storage();
  const catalog = new TcgDexCatalogService({ packs:store({storage:cache}),fetch:async()=>{calls++;return offline();},onCards: rows=>published.push(...rows.map(c=>c.id)) });
  assert.equal((await catalog.listSets()).length,1);
  const first=await catalog.queryCards({setId:'test',pageSize:1}); assert.equal(first.total,2);assert.equal(first.hasMore,true);
  assert.equal(first.cards[0].name,'Eevee'); assert.equal(first.cards[0].marketPrice,null);
  assert.equal((await catalog.queryCards({setId:'test',page:2,pageSize:1})).cards[0].name,'Pikachu');
  assert.equal((await catalog.getVariants('test-1')).length,2);
  assert.equal((await catalog.queryCards({query:'Pikachu'})).total,1);
  assert.equal((await catalog.queryCards({query:'1/2'})).cards[0].catalogIdentity?.id,'test-1');
  assert.equal((await catalog.queryCards({query:'Test Set'})).total,2);
  assert.equal(calls,0);assert.equal(cache.data.size,0);assert.ok(published.length<20);
});
test('complete dated price snapshots retain exact finish prices and survive restart', async () => {
  const cache=storage(), local=store({storage:cache});
  const priced={...pack,fetchedAt:now,cards:[{...cards[0],pricing:{tcgplayer:{unit:'USD',updated:'2026-11-09',normal:{marketPrice:2},'reverse-holofoil':{marketPrice:8}}}},cards[1]]};
  await local.save(validatePack(priced,'test'));
  const catalog=new TcgDexCatalogService({packs:store({storage:cache}),fetch:offline});
  const page=await catalog.queryCards({setId:'test'});
  assert.equal(page.cards[0].name,'Pikachu');assert.equal(page.cards[0].variant,'Reverse holo');assert.equal(page.cards[0].marketPrice?.amount,8);
  assert.equal((await catalog.getCard('tcgdex:en:test-1:normal'))?.marketPrice?.amount,2);
  assert.equal(page.cards[1].marketPrice,null);
});
test('a newer structural base adds printings without dropping dated quotes or mapping them to other cards', async () => {
  const cache=storage();await store({storage:cache}).save(validatePack({...pack,fetchedAt:1,cards:[{...cards[0],pricing:{tcgplayer:{unit:'USD',updated:'2026-10-01',normal:{marketPrice:7}}}}]},'test'));
  const result=await store({storage:cache}).getSet('test');assert.equal(result?.cards.length,2);
  assert.ok(result?.cards[0].pricing);assert.equal(result?.cards[1].pricing,undefined);
});
test('invalid/cross-set packages and unsafe manifest paths fail closed', () => {
  assert.throws(()=>validatePack({...pack,cards:[{...cards[0],id:'other-1'}]},'test'));
  assert.throws(()=>validatePack({...pack,cards:[cards[0],cards[0]]},'test'));
  assert.throws(()=>validatePackIndex({...base,packs:{test:'../../other.json'}}));
  assert.throws(()=>validatePackIndex({...base,sets:[set,set]}));
});
test('failed/corrupt updates never replace the installed base; cancellation prevents installation', async () => {
  const local=store({baseUrl:'https://example.com/catalog',fetch:async()=>Response.json({schema:999})});
  await local.sync(new AbortController().signal);assert.equal((await local.getSet('test'))?.cards.length,2);
  const controller=new AbortController();controller.abort();await local.sync(controller.signal);assert.equal(local.listSets().length,1);
});
test('published packages are persisted independently and restored offline', async () => {
  const cache=storage();const revision='a'.repeat(64);const next={...pack,revision,fetchedAt:now};let calls=0;
  const local=store({storage:cache,baseUrl:'https://example.com/catalog',fetch:async(input: RequestInfo|URL)=>{calls++;return Response.json(String(input).endsWith('manifest.json')?{...base,generatedAt:'2026-11-10T01:00:00Z',packs:{test:`packs/${revision}.json`}}:next);}});
  await local.sync(new AbortController().signal);assert.equal(calls,2);assert.equal((await local.getSet('test'))?.revision,revision);
  assert.equal((await store({storage:cache}).getSet('test'))?.revision,revision);
});
test('a slow device cache cannot hold a cold set or repeatedly delay every card', async () => {
  const local=store({storage:{getItem:()=>new Promise<string|null>(()=>{}),setItem:async()=>{}}});
  const started=Date.now();assert.ok(await local.getSet('test'));assert.ok(Date.now()-started<1500);
  const next=Date.now();assert.ok(await local.read('cards/test-1'));assert.ok(Date.now()-next<100);
});
test('all bundled pictures are original encoded files and all referenced files exist', () => {
  const manifest=JSON.parse(fs.readFileSync('assets/catalog/manifest.json','utf8'));let bytes=0;
  assert.deepEqual(manifest.sets,['30th','me05','me04']);
  for(const file of Object.values(manifest.files) as string[]){const image=fs.readFileSync(`assets/catalog/${file}`);bytes+=image.length;assert.ok(image.subarray(0,4).toString()==='RIFF'||image.subarray(1,4).toString()==='PNG');}
  assert.equal(bytes,manifest.bytes);assert.ok(bytes<60_000_000);
});

test('structural cards retain already saved exact-finish quotes, without borrowing another printing', async () => {
  const exact = { id:'tcgdex:en:test-1:reverse',name:'Pikachu',setName:'Test Set',collectorNumber:'1/2',variant:'Reverse holo' as const,imageKey:'',catalogIdentity:{provider:'tcgdex' as const,language:'en',id:'test-1',variant:'reverse'},marketPrice:{amount:8,currency:'USD' as const,source:'tcgplayer' as const,updatedAt:'2026-11-09',variant:'Reverse holo' as const,variantId:'reverse',kind:'raw' as const}};
  const catalog=new TcgDexCatalogService({packs:store(),fetch:offline,getSavedCard:id=>id===exact.id?exact:undefined});
  const page=await catalog.queryCards({setId:'test'});assert.equal(page.cards[0].id,exact.id);assert.equal(page.cards[0].marketPrice?.amount,8);
  assert.equal((await catalog.getCard('tcgdex:en:test-1:normal'))?.marketPrice,null);
  assert.equal((await catalog.getCard(exact.id))?.marketPrice?.amount,8);
});

test('recognition can explicitly refresh a set index beyond the installed base without remapping old cards', async () => {
  const latest = {...set,cards:[...cards,{id:'test-3',localId:'3',name:'New printing'}]};
  const catalog=new TcgDexCatalogService({packs:store(),now:()=>now,fetch:async input=>Response.json(String(input).includes('sets/test')?latest:[set])});
  assert.equal((await catalog.getSet('test'))?.cards.length,2);
  await catalog.refreshRecognitionIndex(['test']);
  assert.equal((await catalog.getSet('test'))?.cards.length,3);
  assert.equal((await catalog.queryCards({setId:'test'})).total,2,'Installed browsing remains a coherent snapshot until a complete update arrives.');
});

test('new structural updates keep fresher quotes while adding new printings', async () => {
  const local=store();await local.save(validatePack({...pack,fetchedAt:now,cards:[{...cards[0],pricing:{tcgplayer:{unit:'USD',updated:'2026-11-09',normal:{marketPrice:5}}}},cards[1]]},'test'));
  await local.save(validatePack({...pack,revision:'next',cards:[...cards,{id:'test-3',localId:'3',name:'New',variants:{normal:true}}]},'test'));
  const saved=await local.getSet('test');assert.equal(saved?.cards.length,3);assert.ok(saved?.cards[0].pricing);assert.equal(saved?.cards[2].pricing,undefined);
});
