import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const project = 'vzjekkgyrdxzlhaupnrw';
const base = `https://${project}.supabase.co`;
const bucket = 'chase-catalog';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('Configure the existing SUPABASE_ACCESS_TOKEN Actions secret.');
async function checked(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`Catalog publication failed (HTTP ${response.status}); no credentials or response body are logged.`);
  return response;
}
const keys = await (await checked(`https://api.supabase.com/v1/projects/${project}/api-keys`, { headers: { Authorization: `Bearer ${token}` } })).json();
const key = keys.find(k => k.name === 'service_role')?.api_key;
if (!key) throw Error('The management token must allow reading the project server API keys.');
const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
const existingBucket = await fetch(`${base}/storage/v1/bucket/${bucket}`, { headers, signal: AbortSignal.timeout(30000) });
if (!existingBucket.ok) await checked(`${base}/storage/v1/bucket`, { method: 'POST', headers, body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 4000000, allowed_mime_types: ['application/json'] }) });
else if (!(await existingBucket.json()).public) throw Error('The catalog bucket must be public for guest catalog downloads.');
async function upload(file, value, immutable = false) {
  await checked(`${base}/storage/v1/object/${bucket}/${file}`, { method: 'POST', headers: { ...headers, 'x-upsert': 'true', 'cache-control': immutable ? '31536000' : '300' }, body: JSON.stringify(value) });
}
const index = JSON.parse(await fs.readFile('src/data/catalog/index.json', 'utf8'));
let previous;
try { const response = await fetch(`${base}/storage/v1/object/public/${bucket}/manifest.json`, { signal: AbortSignal.timeout(20000) }); if (response.ok) previous = await response.json(); } catch {}
const packs = {};
for (const [position, set] of index.sets.entries()) {
  const pack = JSON.parse(await fs.readFile(`src/data/catalog/sets/${set.id}.json`, 'utf8'));
  // Preserve dated quotes if a refresh is interrupted or a provider is unavailable.
  if (previous?.packs?.[set.id] && /^packs\/[a-f0-9]{64}\.json$/.test(previous.packs[set.id])) {
    try {
      const response = await fetch(`${base}/storage/v1/object/public/${bucket}/${previous.packs[set.id]}`, { signal: AbortSignal.timeout(20000) });
      if (response.ok) { const old = await response.json(); const cards = new Map(old.cards.map(c=>[c.id,c])); for (const card of pack.cards) if (cards.get(card.id)?.pricing) card.pricing = cards.get(card.id).pricing; pack.fetchedAt = old.fetchedAt; }
    } catch {}
  }
  if (process.env.CATALOG_REFRESH_PRICES === 'true') {
    let cursor = 0, failures = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (cursor < pack.cards.length) {
        const card = pack.cards[cursor++];
        try {
          const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.id)}`, { signal: AbortSignal.timeout(15000) });
          if (response.status === 404) continue;
          if (!response.ok) throw Error('Quote unavailable');
          const raw = await response.json();
          if (raw.id !== card.id || raw.set?.id !== set.id) throw Error('Mismatched printing');
          if (raw.pricing) card.pricing = raw.pricing; else delete card.pricing;
          // Canonical live flags supersede the structural base for exact-finish pricing.
          if (raw.variants) card.variants = raw.variants;
        } catch { failures++; }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }));
    if (!failures) pack.fetchedAt = Date.now();
    console.log(`${set.id}: ${pack.cards.length} printings; ${failures} unavailable refreshes (dated saved quotes retained).`);
  }
  // A logical content revision; immutable URL is switched only after a complete upload.
  const revision = createHash('sha256').update(JSON.stringify({ ...pack, revision: undefined })).digest('hex');
  pack.revision = revision;
  const file = `packs/${revision}.json`; await upload(file, pack, true); packs[set.id] = file;
  console.log(`Published set ${position+1}/${index.sets.length}: ${set.id}`);
  // Publish a coherent manifest progressively, leaving older set packages usable.
  const merged = { ...(previous?.packs ?? {}), ...packs };
  await upload('manifest.json', { ...index, revision: index.revision, generatedAt: new Date().toISOString(), packs: Object.fromEntries(index.sets.filter(s=>merged[s.id]).map(s=>[s.id,merged[s.id]])) });
}
console.log('Catalog packages published. No Auth, scanner, collection or billing configuration was changed.');
