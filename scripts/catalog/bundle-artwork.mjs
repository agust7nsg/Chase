import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const index = JSON.parse(await fs.readFile('src/data/catalog/index.json', 'utf8'));
const count = Number(process.argv[2] ?? 3);
const entries = new Map();
let selected = 0; const includedSets = [];
for (const set of index.sets) {
  for (const source of [set.logo, set.symbol].filter(Boolean)) entries.set(source, ['webp', 'png'].map(ext => `${source}.${ext}`));
  const pack = JSON.parse(await fs.readFile(`src/data/catalog/sets/${set.id}.json`, 'utf8'));
  if (selected < count && pack.cards.some(c => c.image)) {
    selected++; includedSets.push(set.id);
    for (const card of pack.cards.filter(c => c.image)) entries.set(card.image, ['high.webp', 'high.png'].map(file => `${card.image}/${file}`));
  }
}
await fs.mkdir('assets/catalog', { recursive: true });
const mapping = {}, missing = [];
let previousMissing = new Set();
try { const previous = JSON.parse(await fs.readFile('assets/catalog/manifest.json', 'utf8')); if (previous.revision === index.revision) previousMissing = new Set(previous.missing); } catch {}
const queue = [...entries]; let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < queue.length) {
    const [source, urls] = queue[cursor++]; let found;
    if (previousMissing.has(source)) { missing.push(source); continue; }
    for (const url of urls) {
      const file = `${createHash('sha256').update(source).digest('hex').slice(0, 24)}.${url.endsWith('.png') ? 'png' : 'webp'}`;
      const destination = path.join('assets/catalog', file);
      try {
        try { await fs.access(destination); } catch {
          await exec('curl', ['-fsSL', '--retry', '2', '--retry-delay', '1', '--max-time', '25', url, '-o', `${destination}.part`]);
          const bytes = await fs.readFile(`${destination}.part`);
          const valid = file.endsWith('.png') ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
          if (!valid) throw Error('Invalid image');
          await fs.rename(`${destination}.part`, destination);
        }
        found = file; break;
      } catch { await fs.rm(`${destination}.part`, { force: true }); }
    }
    if (found) mapping[source] = found; else missing.push(source);
  }
}));
const sorted = Object.entries(mapping).sort(([a],[b]) => a.localeCompare(b));
await fs.writeFile('src/data/catalog/artwork.ts', `// Original provider files, unchanged resolution and bytes.\nexport const catalogArtwork: Record<string, number | string> = {\n${sorted.map(([source,file]) => `  '${source}': require('../../../assets/catalog/${file}'),`).join('\n')}\n};\n`);
const bytes = (await Promise.all(sorted.map(([,file]) => fs.stat(`assets/catalog/${file}`)))).reduce((n,s) => n+s.size,0);
await fs.writeFile('assets/catalog/manifest.json', JSON.stringify({ source: 'https://assets.tcgdex.net', revision: index.revision, generatedAt: new Date().toISOString(), sets: includedSets, files: Object.fromEntries(sorted), bytes, missing }, null, 2));
console.log(JSON.stringify({ originals: sorted.length, bytes, missing: missing.length }));
