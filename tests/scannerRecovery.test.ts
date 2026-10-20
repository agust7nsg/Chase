import assert from 'node:assert/strict';
import test from 'node:test';
import { ScannerController } from '../src/services/scannerController';
import { CardSightError } from '../src/services/cardsight/types';
import { CameraCaptureGate, CameraCaptureTimeout, cameraDeadline, scannerPictureSize } from '../src/services/cameraCapture';
import { createScannerProxy } from '../server/cardsightProxy';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function session(recognize: (fingerprint: string, signal: AbortSignal) => Promise<string>) {
  let now = Date.now();
  const controller = new ScannerController((frame, signal) => recognize(frame.fingerprint, signal), () => {}, () => now);
  controller.resume();
  const observe = (fingerprint: string | null, advance = 650, confirmed = false) => {
    now += advance; controller.observe(fingerprint ? { fingerprint, timestamp: now } : null, now, confirmed);
  };
  const present = async (fingerprint: string) => { observe(fingerprint); observe(fingerprint); await settle(); };
  const advance = (elapsed: number) => { now += elapsed; controller.tick(now); };
  return { controller, observe, present, advance };
}

test('twenty consecutive physical presentations each stage once without leaving the scanner', async () => {
  const requests: string[] = [];
  const { controller, present, observe } = session(async id => { requests.push(id); return id; });
  for (let index = 0; index < 20; index++) {
    await present('card-' + index);
    for (let frame = 0; frame < 4; frame++) observe('card-' + index);
    await settle(); assert.equal(requests.length, index + 1);
  }
  assert.equal(new Set(requests).size, 20); controller.dispose();
});

test('a failed presentation is held without retries, but a different card automatically recovers', async () => {
  let requests = 0;
  const { controller, present, observe } = session(async id => { requests++; if (id === 'bad') throw new CardSightError('NO_MATCH', 'No card'); return id; });
  await present('bad'); assert.equal(controller.status.phase, 'ERROR');
  for (let index = 0; index < 8; index++) observe('bad');
  await settle(); assert.equal(requests, 1);
  await present('good'); assert.equal(requests, 2); assert.equal(controller.status.phase, 'RESULT_READY');
  controller.dispose();
});

test('confirmed removal after error permits a deliberate second attempt of the same printing', async () => {
  let requests = 0;
  const { controller, present, observe, advance } = session(async () => { if (++requests === 1) throw new Error('Image could not be read'); return 'same'; });
  await present('same'); observe(null, 650, true); advance(1350); await present('same');
  assert.equal(requests, 2); controller.dispose();
});

test('transient feedback clears after two seconds while a held failed card stays locked', async () => {
  let requests = 0;
  const { controller, present, observe, advance } = session(async () => { requests++; throw new Error('No readable card'); });
  await present('held'); assert.equal(controller.status.phase, 'ERROR');
  advance(controller.errorDisplayMs - 1); assert.equal(controller.status.phase, 'ERROR');
  advance(1); assert.equal(controller.status.phase, 'SEARCHING'); assert.equal(controller.status.error, null);
  for (let index = 0; index < 12; index++) observe('held');
  await settle(); assert.equal(requests, 1); assert.equal(controller.status.phase, 'SEARCHING');
  controller.dispose();
});

test('a new stable card waits for transient feedback then scans automatically without Retry', async () => {
  let requests = 0;
  const { controller, present, observe, advance } = session(async id => { requests++; if (id === 'bad') throw new Error('Could not recognize'); return id; });
  await present('bad'); observe('good', 100); observe('good', 650); await settle();
  assert.equal(requests, 1); assert.equal(controller.status.phase, 'ERROR');
  advance(1250); await present('good');
  assert.equal(requests, 2); assert.equal(controller.status.phase, 'RESULT_READY');
  controller.dispose();
});

test('removal during transient feedback does not hide the explanation early or retry before its deadline', async () => {
  let requests = 0;
  const { controller, present, observe, advance } = session(async () => { if (++requests === 1) throw new Error('Try a clearer presentation'); return 'same'; });
  await present('same'); observe(null, 100, true);
  assert.equal(controller.status.phase, 'ERROR');
  observe('same', 100); observe('same', 500); await settle(); assert.equal(requests, 1);
  advance(1300); await present('same');
  assert.equal(requests, 2); assert.equal(controller.status.phase, 'RESULT_READY');
  controller.dispose();
});

test('Organize preserves the failed-card lock after transient feedback expires', async () => {
  let requests = 0;
  const { controller, present, observe, advance } = session(async id => { requests++; if (id === 'bad') throw new Error('No match'); return id; });
  await present('bad'); controller.pause(); advance(5000);
  assert.equal(controller.status.phase, 'ERROR');
  controller.resume(); observe('bad'); observe('bad'); await settle();
  assert.equal(controller.status.phase, 'SEARCHING'); assert.equal(requests, 1);
  await present('good'); assert.equal(requests, 2); controller.dispose();
});

test('provider authentication and quota errors stay explicit instead of charging a request for each new card', async () => {
  for (const code of ['CONFIGURATION', 'RATE_LIMITED'] as const) {
    let requests = 0;
    const { controller, present, observe, advance } = session(async () => { requests++; throw new CardSightError(code, 'Server needs attention'); });
    await present('A'); observe(null, 650, true); await present('B'); await present('C');
    advance(60_000);
    assert.equal(requests, 1); assert.equal(controller.status.phase, 'ERROR');
    controller.retry(); await present('C'); assert.equal(requests, 2); controller.dispose();
  }
});

test('removing a submitted card does not discard its valid result while the camera stays open', async () => {
  let finish!: (id: string) => void; let signal!: AbortSignal;
  const { controller, present, observe } = session(async (_id, received) => { signal = received; return new Promise(resolve => { finish = resolve; }); });
  await present('A'); observe(null, 650, true);
  assert.equal(signal.aborted, false); finish('printing-A'); await settle();
  assert.equal(controller.status.phase, 'RESULT_READY'); assert.equal(controller.status.cardId, 'printing-A'); controller.dispose();
});

test('Organize/background transitions keep the stationary-card lock while allowing a different card after return', async () => {
  let requests = 0;
  const { controller, present, observe } = session(async id => { requests++; return id; });
  await present('A');
  for (let index = 0; index < 5; index++) {
    controller.pause(); controller.resume(); observe('A'); observe('A'); await settle();
    assert.equal(requests, 1);
  }
  await present('B'); assert.equal(requests, 2); controller.dispose();
});

test('capture gates require readiness and cannot inherit a busy capture from a disposed native camera', () => {
  const oldCamera = new CameraCaptureGate(); assert.equal(oldCamera.begin(), undefined);
  oldCamera.markReady(); const oldLease = oldCamera.begin()!; assert.equal(oldCamera.begin(), undefined);
  oldCamera.retire(); assert.equal(oldCamera.current(oldLease), false);
  const nextCamera = new CameraCaptureGate(); nextCamera.markReady(); const nextLease = nextCamera.begin()!;
  oldCamera.end(oldLease); assert.equal(nextCamera.begin(), undefined);
  nextCamera.end(nextLease); assert.equal(typeof nextCamera.begin(), 'number');
});

test('a hanging native capture has a bounded deadline and late native completion can still clean up', async () => {
  let finish!: (value: string) => void; let cleaned = false;
  const native = new Promise<string>(resolve => { finish = resolve; }).finally(() => { cleaned = true; });
  await assert.rejects(cameraDeadline(native, 5), CameraCaptureTimeout);
  assert.equal(cleaned, false); finish('late photo'); await settle(); assert.equal(cleaned, true);
  assert.equal(await cameraDeadline(Promise.resolve('ready'), 10), 'ready');
});

test('picture configuration ignores malformed sizes and chooses a bounded supported resolution once', () => {
  assert.equal(scannerPictureSize(['bad', '0x0', '640x480', '4000x3000', '1280x720', '1920x1080']), '1280x720');
  assert.equal(scannerPictureSize([]), undefined);
});

test('already-stable frames respect the actual proxy request interval without generating a throttle error', { timeout: 2000 }, async () => {
  let now = 10_000; let calls = 0; let requests = 0;
  const token = 'proxy_interval_fixture_pairing_123456';
  const proxy = createScannerProxy({ apiKey: 'fixture', devToken: token, now: () => now,
    transport: async () => { calls++; return { candidates: [] }; } });
  let finished: () => void = () => {};
  const completion = () => new Promise<void>(resolve => { finished = resolve; });
  const controller = new ScannerController(async frame => {
    const response = await proxy(new Request('http://local/recognize', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'spacing_' + ++requests, image: { mimeType: 'image/jpeg', base64: '/9j/4AAQ/9k=' } }) }));
    assert.equal(response.status, 200); return frame.fingerprint;
  }, status => { if (status.phase === 'RESULT_READY' || status.phase === 'ERROR') finished(); });
  controller.resume();
  const observe = (fingerprint: string, time: number) => { now = time; controller.observe({ fingerprint, timestamp: now, stable: true }, now); };
  let done = completion(); observe('A', now); await done; assert.equal(calls, 1);
  observe('B', 11_300); await settle(); assert.equal(calls, 1);
  done = completion(); observe('B', 11_650); await done; assert.equal(calls, 2);
  assert.equal(controller.status.phase, 'RESULT_READY');
  controller.dispose();
});
