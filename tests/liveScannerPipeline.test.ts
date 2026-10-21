import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveScannerPipeline, type SampleCamera } from '../src/services/liveScannerPipeline';
import { LiveCardPresentationTracker, type CardPixelObservation } from '../src/services/liveCardFrames';
import { ScannerController } from '../src/services/scannerController';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const card = (style = 0): CardPixelObservation => ({ presence: 'card', quality: 'ready', boundary: 30, contrast: 40, detail: 30,
  signature: Array.from({ length: 240 }, (_, index) => ((index + style) % 3 === 0 ? 0.9 : -0.6)) });
const empty = (): CardPixelObservation => ({ presence: 'empty', quality: 'uncertain', boundary: 0, contrast: 0, detail: 0, signature: null });
function setup(recognize?: (signal: AbortSignal) => Promise<string>, captureMs = 2350) {
  let now = 0; let identity = 'A'; let observation = card(); let requests = 0; let copies = 0; let uploads = 0; let captures = 0;
  const tracker = new LiveCardPresentationTracker();
  const controller: ScannerController = new ScannerController(async (frame, signal): Promise<string> => {
    requests++;
    assert.ok(frame.image, 'every external recognition must have its selected original image');
    const id = recognize ? await recognize(signal) : identity;
    if (controller.shouldStageResult(frame, id)) copies++;
    return id;
  }, () => {}, () => now);
  const pipeline = new LiveScannerPipeline(controller, tracker, () => true, () => now);
  const camera: SampleCamera = async shouldUpload => {
    captures++; now += captureMs;
    const upload = shouldUpload(observation);
    if (upload) uploads++;
    return { observation, ...(upload ? { image: { base64: 'camera-fixture', mimeType: 'image/jpeg' as const, width: 768, height: 1056 } } : {}),
      timings: { captureMs, analysisMs: 0, uploadMs: upload ? 100 : 0, totalMs: captureMs + (upload ? 100 : 0) } };
  };
  pipeline.start();
  const sample = async (value = observation) => { observation = value; now += 650; await pipeline.sample(camera); await settle(); };
  return { controller, tracker, pipeline, sample, camera, setIdentity: (id: string) => { identity = id; },
    counts: () => ({ requests, copies, uploads, captures }), advance: (ms: number) => { now += ms; } };
}

test('twenty native-speed presentations progress even when every observation takes more than2.2seconds', async () => {
  const run = setup();
  for (let index = 0; index < 20; index++) {
    run.setIdentity('printing-' + index);
    for (let frame = 0; frame < 3; frame++) await run.sample(card(index % 3));
    assert.equal(run.counts().copies, index + 1, `printing ${index} must not get stuck behind the previous one`);
  }
  assert.equal(run.counts().uploads, 20); assert.equal(run.counts().requests, 20);
  assert.equal(run.counts().captures, 60); run.pipeline.stop();
});

test('held-card observations keep running but never encode or upload another full image', async () => {
  const run = setup();
  for (let sample = 0; sample < 25; sample++) await run.sample();
  assert.deepEqual(run.counts(), { requests: 1, copies: 1, uploads: 1, captures: 25 }); run.pipeline.stop();
});

test('removal and a second physical copy are observed while the first request is still in flight', async () => {
  let finish!: (id: string) => void;
  const run = setup(() => new Promise(resolve => { finish = resolve; }));
  await run.sample(); await run.sample(); assert.equal(run.counts().requests, 1);
  await run.sample(empty()); await run.sample(empty());
  await run.sample(card()); await run.sample(card());
  assert.equal(run.counts().uploads, 1, 'local analysis during recognition must not make overlapping uploads');
  finish('same-printing'); await settle();
  await run.sample(card()); assert.equal(run.counts().requests, 2);
  finish('same-printing'); await settle(); assert.equal(run.counts().copies, 2);
  run.pipeline.stop();
});

test('an appearance verification of the same identity cannot add a stationary copy, but deliberate removal can', async () => {
  const run = setup();
  await run.sample(card()); await run.sample(card()); assert.equal(run.counts().copies, 1);
  await run.sample(card(1)); await run.sample(card(1));
  assert.equal(run.counts().requests, 2); assert.equal(run.counts().copies, 1);
  assert.equal(run.controller.status.phase, 'WAITING_FOR_CARD_CHANGE');
  for (let index = 0; index < 8; index++) await run.sample(card(1));
  assert.equal(run.counts().requests, 2);
  await run.sample(empty()); await run.sample(empty());
  await run.sample(card(1)); await run.sample(card(1));
  assert.equal(run.counts().copies, 2); assert.equal(run.counts().requests, 3); run.pipeline.stop();
});

test('navigation during a late capture cannot upload a ghost result and future sampling can resume', async () => {
  const run = setup(); let release!: () => void;
  const late: SampleCamera = async predicate => {
    await new Promise<void>(resolve => { release = resolve; });
    assert.equal(predicate(card()), false, 'old camera generation cannot prepare an upload after navigation');
    return { observation: card(), timings: { captureMs: 2000, analysisMs: 0, uploadMs: 0, totalMs: 2000 } };
  };
  const sampling = run.pipeline.sample(late);
  run.pipeline.stop(); run.pipeline.start(); release(); await sampling;
  assert.equal(run.counts().requests, 0);
  await run.sample(); await run.sample(); assert.equal(run.counts().copies, 1); run.pipeline.stop();
});

test('an old camera capture cannot keep a newly mounted preview busy after returning from Organize', async () => {
  const run = setup(); let release!: () => void;
  const old = run.pipeline.sample(async predicate => {
    await new Promise<void>(resolve => { release = resolve; });
    assert.equal(predicate(card()), false);
    return { observation: card(), timings: { captureMs: 5000, analysisMs: 0, uploadMs: 0, totalMs: 5000 } };
  });
  run.pipeline.stop(); run.pipeline.start();
  await run.sample(); await run.sample();
  assert.equal(run.counts().copies, 1, 'new native mount must sample before the old operation eventually finishes');
  release(); await old;
  await run.sample(); assert.equal(run.counts().copies, 1); run.pipeline.stop();
});

test('a capture failure releases the sampler so a later sample does not inherit a permanent busy latch', async () => {
  const run = setup();
  await assert.rejects(run.pipeline.sample(async () => { throw new Error('native capture failed'); }), /native capture failed/);
  await run.sample(); await run.sample(); assert.equal(run.counts().copies, 1); run.pipeline.stop();
});
