import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const root = path.resolve(process.argv[2] ?? '');
const assets = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const destination = path.resolve(process.argv[4] ?? 'src/data/catalog');
const memo = new Map();
// Parse data literals only; never execute code from the external database.
function read(file, keys) {
  file = path.resolve(file); if (!file.startsWith(`${root}/data/`)) throw Error('Outside data source');
  const cacheKey = `${file}:${keys.join(',')}`; if (memo.has(cacheKey)) return memo.get(cacheKey);
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const bindings = new Map(), imports = new Map(); let exported;
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement)) {
      const name = statement.importClause?.name?.text;
      if (name) imports.set(name, path.resolve(path.dirname(file), `${statement.moduleSpecifier.text}.ts`));
    }
    if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) bindings.set(d.name.getText(tree), d.initializer);
    if (ts.isExportAssignment(statement)) exported = statement.expression;
  }
  function value(node, pick) {
    if (!node) return undefined;
    if (ts.isIdentifier(node)) {
      if (node.text === 'undefined') return undefined;
      if (imports.has(node.text)) return read(imports.get(node.text), pick ?? keys);
      return value(bindings.get(node.text), pick);
    }
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return value(node.expression, pick);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(el => value(el));
    if (ts.isObjectLiteralExpression(node)) {
      const result = {};
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) { Object.assign(result, value(property.expression, pick)); continue; }
        const key = property.name?.text;
        if (pick && !pick.includes(key)) continue;
        if (ts.isPropertyAssignment(property)) result[key] = value(property.initializer, key === 'serie' ? ['id', 'name'] : undefined);
        else if (ts.isShorthandPropertyAssignment(property)) result[key] = value(property.name, key === 'serie' ? ['id', 'name'] : undefined);
        else throw Error(`Unsupported data property in ${file}`);
      }
      return result;
    }
    throw Error(`Nonliteral data in ${file}: ${node.getText(tree).slice(0, 80)}`);
  }
  const result = value(exported, keys); memo.set(cacheKey, result); return result;
}
const sets = [], packs = [];
for (const serie of fs.readdirSync(path.join(root, 'data'), { withFileTypes: true }).filter(e => e.isDirectory())) {
  const folder = path.join(root, 'data', serie.name);
  for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.ts'))) {
    const source = read(path.join(folder, name), ['id', 'name', 'serie', 'releaseDate', 'cardCount']);
    if (!source.name?.en || !source.serie?.name?.en) continue;
    const cardFolder = path.join(folder, name.slice(0, -3));
    const pictures = assets.en?.[source.serie.id]?.[source.id] ?? {};
    const symbol = assets.univ?.[source.serie.id]?.[source.id]?.symbol;
    const set = { id: source.id, name: source.name.en, releaseDate: typeof source.releaseDate === 'string' ? source.releaseDate : source.releaseDate?.en ?? Object.values(source.releaseDate ?? {})[0], cardCount: { official: source.cardCount.official, total: 0 }, ...(pictures.logo ? { logo: `https://assets.tcgdex.net/en/${source.serie.id}/${source.id}/logo` } : {}), ...(symbol ? { symbol: `https://assets.tcgdex.net/univ/${source.serie.id}/${source.id}/symbol` } : {}) };
    const cards = [];
    if (fs.existsSync(cardFolder)) for (const cardFile of fs.readdirSync(cardFolder).filter(n => n.endsWith('.ts'))) {
      const card = read(path.join(cardFolder, cardFile), ['name', 'variants', 'description']); if (!card.name?.en) continue;
      const localId = cardFile.slice(0, -3);
      const v = card.variants;
      const variants = Array.isArray(v) ? { normal: v.some(x => x.type === 'normal'), holo: v.some(x => x.type === 'holo'), reverse: v.some(x => x.type === 'reverse'), firstEdition: v.some(x => x.stamp?.includes('1st-edition')), wPromo: v.some(x => x.stamp?.includes('w-Promo')) } : { normal: v?.normal ?? true, holo: v?.holo ?? false, reverse: v?.reverse ?? false, firstEdition: v?.firstEdition ?? false, wPromo: v?.wPromo ?? false };
      cards.push({ id: `${set.id}-${localId}`, localId, name: card.name.en, variants, ...(pictures[localId] || set.id === '30th' ? { image: `https://assets.tcgdex.net/en/${source.serie.id}/${source.id}/${localId}` } : {}), ...(card.description?.en ? { description: card.description.en } : {}) });
    }
    set.cardCount.total = Math.max(set.cardCount.official, cards.length);
    if (!/^[a-zA-Z0-9.-]+$/.test(set.id)) throw Error('Unsafe set id');
    sets.push(set); packs.push({ schema: 1, language: 'en', set, cards });
  }
}
sets.sort((a,b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
fs.mkdirSync(path.join(destination, 'sets'), { recursive: true });
for (const pack of packs) fs.writeFileSync(path.join(destination, 'sets', `${pack.set.id}.json`), JSON.stringify({ ...pack, revision }));
fs.writeFileSync(path.join(destination, 'index.json'), JSON.stringify({ schema: 1, language: 'en', revision, generatedAt: new Date().toISOString(), sets }));
fs.writeFileSync(path.join(destination, 'loaders.ts'), `// Generated from the pinned official TCGdex database; load one set at a time.\nexport const bundledPacks: Record<string, () => unknown> = {\n${sets.map(s => `  '${s.id}': () => require('./sets/${s.id}.json'),`).join('\n')}\n};\n`);
console.log(JSON.stringify({ sets: sets.length, cards: packs.reduce((n,p)=>n+p.cards.length,0), pictured: packs.reduce((n,p)=>n+p.cards.filter(c=>c.image).length,0), revision }));

fs.writeFileSync(path.join(destination, 'search.json'), JSON.stringify(packs.flatMap(p => p.cards.map(c => ({ id: c.id, localId: c.localId, name: c.name, setId: p.set.id })))));
