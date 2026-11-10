import fs from 'node:fs';
import { validatePack, validatePackIndex } from '../../src/services/tcgdex/packs';
const index = validatePackIndex(JSON.parse(fs.readFileSync('src/data/catalog/index.json','utf8')));
let cards = 0; const ids = new Set();
for (const set of index.sets) {
  const pack = validatePack(JSON.parse(fs.readFileSync(`src/data/catalog/sets/${set.id}.json`,'utf8')), set.id);
  for (const card of pack.cards) { if (ids.has(card.id)) throw new Error('Duplicate canonical printing'); ids.add(card.id); }
  cards += pack.cards.length;
}
if (index.sets.length < 200 || cards < 20000) throw new Error('Refusing to publish an unexpectedly incomplete English catalog.');
console.log(`Validated ${index.sets.length} sets and ${cards} unique canonical printings.`);
