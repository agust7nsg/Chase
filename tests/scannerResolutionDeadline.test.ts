import assert from 'node:assert/strict';
import test from 'node:test';
import { CardSightRecognitionService } from '../src/services/cardsight/client';
import { resolveCardSightCandidates, type RecognitionCatalog } from '../src/services/cardsight/resolve';
import { CatalogResolutionError, type CardSightCandidate } from '../src/services/cardsight/types';
import { RecognitionLinks } from '../src/services/cardsight/links';
import type { Card } from '../src/types/domain';

const candidate: CardSightCandidate = { providerId: 'fixture-35', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108',
  language: 'en', finish: 'normal', confidenceTier: 'High', tcgdexId: 'xy12-35' };
const card: Card = { id: 'tcgdex:en:xy12-35:normal', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108',
  variant: 'Normal', imageKey: 'fixture', marketPrice: null, catalogIdentity: { provider: 'tcgdex', language: 'en', id: 'xy12-35', variant: 'normal' } };
const image = { base64: '/9j/aGVsbG8=', mimeType: 'image/jpeg' as const, width: 600, height: 840 };
const never = <T,>() => new Promise<T>(() => {});
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const source = (getVariants: RecognitionCatalog['getVariants']): RecognitionCatalog => ({ listSets: async () => [], getSet: async () => undefined, getVariants });

function service(catalog: RecognitionCatalog, extra: Partial<ConstructorParameters<typeof CardSightRecognitionService>[0]> = {}) {
  return new CardSightRecognitionService({ proxyUrl: 'http://localhost:8787', token: 'fixture-pairing-token', catalog,
    catalogTimeoutMs: 20, fetch: async () => Response.json({ candidates: [candidate] }), ...extra });
}

test('first printing succeeds, stalled catalog for the second becomes pending, then the third recognition succeeds', async () => {
  let calls = 0; let uploads = 0;
  const client = service(source(async () => ++calls === 2 ? never<Card[]>() : [card]), {
    fetch: async () => { uploads++; return Response.json({ candidates: [candidate] }); },
  });
  assert.equal((await client.recognize({ image })).id, card.id);
  await assert.rejects(client.recognize({ image }), error => {
    assert.ok(error instanceof CatalogResolutionError);
    assert.deepEqual(error.recognition, { candidates: [candidate] });
    assert.equal(error.diagnostics.stage, 'network');
    assert.equal(JSON.stringify(error.recognition).includes(image.base64), false);
    return true;
  });
  assert.equal((await client.recognize({ image })).id, card.id, 'catalog timeout releases the same client mutex');
  assert.equal(uploads, 3, 'the stalled lookup never uploads an image a second time');
});

test('automatic resolution has one overall budget and stops new set/detail requests after it expires', async () => {
  let finishSets!: (sets: Awaited<ReturnType<RecognitionCatalog['listSets']>>) => void;
  let details = 0; let variants = 0;
  const pending = resolveCardSightCandidates({ candidates: [{ ...candidate, tcgdexId: undefined }] }, {
    listSets: () => new Promise(resolve => { finishSets = resolve; }),
    getSet: async () => { details++; return undefined; }, getVariants: async () => { variants++; return [card]; },
  }, { catalogTimeoutMs: 20 });
  await assert.rejects(pending, CatalogResolutionError);
  finishSets([{ id: 'xy12', name: 'Evolutions' }]);
  await pause(5);
  assert.equal(details, 0); assert.equal(variants, 0, 'late index results cannot continue a timed-out search');
});

test('navigation cancellation wins over a stalled catalog and late catalog data cannot return a recognized card', async () => {
  let finish!: (cards: Card[]) => void; let returned = 0; let calls = 0;
  const client = service(source(async () => ++calls === 1 ? new Promise<Card[]>(resolve => { finish = resolve; }) : [card]), { catalogTimeoutMs: 500 });
  const controller = new AbortController();
  const pending = client.recognize({ image, signal: controller.signal }).then(result => { returned++; return result; });
  while (!finish) await pause(1);
  controller.abort(); await assert.rejects(pending, { code: 'ABORTED' });
  finish([card]); await pause(5); assert.equal(returned, 0);
  assert.equal((await client.recognize({ image })).id, card.id);
});

test('deliberate printing review is outside the automatic catalog deadline', async () => {
  const response = { candidates: [{ ...candidate, confidenceTier: 'Medium' as const }] };
  const client = service(source(async () => [card]), { fetch: async () => Response.json(response) });
  let chose = false;
  const result = await client.recognize({ image, chooseCandidate: async choices => {
    await pause(60); chose = true; return choices[0];
  } });
  assert.equal(chose, true); assert.equal(result.id, card.id);
});

test('an optional cross-provider link read cannot indefinitely block catalog resolution', async () => {
  const links = new RecognitionLinks({ getItem: () => never<string | null>(), setItem: async () => {} });
  const catalog: RecognitionCatalog = {
    listSets: async () => [{ id: 'xy12', name: 'Evolutions' }],
    getSet: async () => ({ id: 'xy12', name: 'Evolutions', cards: [{ id: 'xy12-35', localId: '35', name: 'Pikachu' }] }),
    getVariants: async () => [card],
  };
  const result = await resolveCardSightCandidates({ candidates: [{ ...candidate, tcgdexId: undefined }] }, catalog,
    { links, catalogTimeoutMs: 1000 });
  assert.equal(result.id, card.id);
});

test('optional link persistence cannot hold the client busy after printing confirmation', async () => {
  let writes = 0;
  const links = new RecognitionLinks({ getItem: async () => null, setItem: async () => { writes++; return never<void>(); } });
  const client = service(source(async () => [card]), { links, fetch: async () => Response.json({ candidates: [{ ...candidate, confidenceTier: 'Medium' }] }) });
  assert.equal((await client.recognize({ image, chooseCandidate: async choices => choices[0] })).id, card.id);
  assert.equal(writes, 1);
  assert.equal((await client.recognize({ image, chooseCandidate: async choices => choices[0] })).id, card.id, 'a hung cache write from an earlier scan does not monopolize later scans');
});

test('an abort-ignorant provider fetch still times out and releases recognition', async () => {
  let calls = 0;
  const client = service(source(async () => [card]), { timeoutMs: 20, fetch: async () => ++calls === 1 ? never<Response>() : Response.json({ candidates: [candidate] }) });
  await assert.rejects(client.recognize({ image }), { code: 'TIMEOUT' });
  assert.equal((await client.recognize({ image })).id, card.id);
});
