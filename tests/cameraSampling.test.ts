import assert from 'node:assert/strict';
import test from 'node:test';
import { CameraSampleDeadline, CameraCaptureTimeout, scannerPictureSize, selectiveCameraSample } from '../src/services/cameraCapture';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('continuous sampling analyzes held/background frames without encoding an upload for every frame', async () => {
  let analyses = 0; let decisions = 0; let uploads = 0;
  for (let index = 0; index < 20; index++) {
    const sample = await selectiveCameraSample({
      analyze: async () => { analyses++; return { index }; },
      shouldUpload: observation => { decisions++; return observation.index === 6 || observation.index === 14; },
      encode: async () => { uploads++; return 'jpeg'; }, current: () => true, onUpload: () => {},
    });
    assert.equal(sample?.observation.index, index);
    assert.equal(sample?.image, index === 6 || index === 14 ? 'jpeg' : undefined);
    if (sample?.image === undefined) assert.equal(sample?.uploadMs, 0);
  }
  assert.equal(analyses, 20); assert.equal(decisions, 20); assert.equal(uploads, 2);
});

test('a retired camera sample never invokes the upload decision or creates a stale image', async () => {
  let current = true; let decisions = 0; let uploads = 0;
  const sample = await selectiveCameraSample({
    analyze: async () => { current = false; return 'observation'; },
    shouldUpload: () => { decisions++; return true; },
    encode: async () => { uploads++; return 'jpeg'; }, current: () => current, onUpload: () => {},
  });
  assert.equal(sample, undefined); assert.equal(decisions, 0); assert.equal(uploads, 0);
});

test('a camera retired during upload never publishes its late image', async () => {
  let current = true;
  const sample = await selectiveCameraSample({ analyze: async () => 'observation', shouldUpload: () => true,
    encode: async () => { current = false; return 'jpeg'; }, current: () => current, onUpload: () => {},
  });
  assert.equal(sample, undefined);
});

test('the upload predicate is called once and its exception releases the caller for recovery', async () => {
  let decisions = 0; let uploads = 0;
  await assert.rejects(selectiveCameraSample({ analyze: async () => 'observation',
    shouldUpload: () => { decisions++; throw new Error('Scene changed'); },
    encode: async () => { uploads++; return 'jpeg'; }, current: () => true, onUpload: () => {},
  }), /Scene changed/);
  assert.equal(decisions, 1); assert.equal(uploads, 0);
});

test('observation and selected upload have separate bounded deadlines without suppressing late cleanup', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const deadline = new CameraSampleDeadline(80, 120);
  let completed = false;
  const result = deadline.run((async () => {
    await wait(35); deadline.allowUpload(); await wait(75); completed = true; return 'jpeg';
  })());
  context.mock.timers.tick(35); await Promise.resolve();
  context.mock.timers.tick(74); await Promise.resolve(); assert.equal(completed, false);
  context.mock.timers.tick(1);
  assert.equal(await result, 'jpeg'); assert.equal(completed, true);
  const hung = new CameraSampleDeadline(5, 5);
  let finish!: () => void; let cleaned = false;
  const late = new Promise<void>(resolve => { finish = resolve; }).finally(() => { cleaned = true; });
  const rejected = assert.rejects(hung.run(late), CameraCaptureTimeout);
  context.mock.timers.tick(5); await rejected;
  finish(); await late; assert.equal(cleaned, true);
});

test('resolution selection has a bounded fallback when the camera only lists small picture sizes', () => {
  assert.equal(scannerPictureSize(['bad', '0x0', '640x480', '320x240']), '640x480');
  assert.equal(scannerPictureSize(['0x480', 'invalid']), undefined);
  assert.equal(scannerPictureSize(['4000x3000', '1920x1080', '1280x720']), '1280x720');
});
