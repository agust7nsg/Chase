import assert from 'node:assert/strict';
import test from 'node:test';
import { CameraPreviewLayout } from '../src/services/cameraPreviewLayout';

const portrait = { width: 390, height: 844 };

test('Android waits for camera-open and each measured expand/restore phase before capture readiness', () => {
  const layout = new CameraPreviewLayout(portrait, true);
  assert.deepEqual(layout.snapshot, { ...portrait, phase: 'measuring', ready: false });
  assert.equal(layout.cameraReady().phase, 'measuring');
  assert.deepEqual(layout.layout(390, 844), { width: 390, height: 845, phase: 'expand', ready: false });
  assert.equal(layout.cameraReady().phase, 'expand', 'Repeated camera-open events cannot stand in for native layout.');
  assert.equal(layout.layout(390, 844).phase, 'expand', 'A repeated base measurement does not establish expansion.');
  assert.deepEqual(layout.layout(390, 845), { ...portrait, phase: 'restore', ready: false });
  assert.equal(layout.layout(390, 845).phase, 'restore', 'Late expanded measurement cannot finish restoration.');
  assert.deepEqual(layout.layout(390, 844), { ...portrait, phase: 'ready', ready: true });
});

test('layout may arrive before camera-open, but wrong or invalid actual bounds cannot advance', () => {
  const layout = new CameraPreviewLayout(portrait, true);
  const original = layout.snapshot;
  assert.equal(layout.layout(390, 844), original);
  for (const [width, height] of [[390, 500], [0, 844], [NaN, 844], [390, Infinity], [-1, 844]]) {
    assert.equal(layout.layout(width, height), original);
  }
  assert.equal(layout.cameraReady(), original, 'Last actual measurement is invalid despite a prior matching callback.');
  assert.equal(layout.layout(390, 844).phase, 'expand');
});

test('native rounding within half a logical pixel is tolerated without accepting larger size mismatches', () => {
  const layout = new CameraPreviewLayout(portrait, true);
  layout.cameraReady();
  assert.equal(layout.layout(389.49, 844).phase, 'measuring');
  assert.equal(layout.layout(389.5, 843.5).phase, 'expand');
  assert.equal(layout.layout(390.5, 845.5).phase, 'restore');
  assert.equal(layout.layout(390, 844.51).phase, 'restore');
  assert.equal(layout.layout(390.5, 844.5).ready, true);
});

test('platforms without native reflow still require both readiness and exact layout in either event order', () => {
  const before = new CameraPreviewLayout(portrait, false);
  before.layout(390, 844);
  assert.equal(before.snapshot.ready, false);
  assert.equal(before.cameraReady().ready, true);
  const after = new CameraPreviewLayout(portrait, false);
  after.cameraReady();
  assert.equal(after.snapshot.ready, false);
  assert.equal(after.layout(390, 844).ready, true);
});

test('retired instance ignores every late ready/layout callback and cannot affect the replacement mount', () => {
  const old = new CameraPreviewLayout(portrait, true);
  old.cameraReady(); old.layout(390, 844);
  const retired = old.retire();
  assert.equal(retired.phase, 'retired'); assert.equal(retired.ready, false);
  const replacement = new CameraPreviewLayout(portrait, true);
  assert.equal(old.layout(390, 845), retired);
  assert.equal(old.cameraReady(), retired);
  assert.equal(old.retire(), retired);
  assert.equal(replacement.snapshot.ready, false);
  replacement.cameraReady(); replacement.layout(390, 844); replacement.layout(390, 845);
  assert.equal(replacement.snapshot.ready, false);
  assert.equal(replacement.layout(390, 844).ready, true);
});

test('every remount requires a fresh handshake and owns a copied immutable bounds snapshot', () => {
  const mutable = { ...portrait };
  const first = new CameraPreviewLayout(mutable, true);
  const original = first.snapshot;
  assert.equal(Object.isFrozen(original), true);
  mutable.height = 500;
  assert.equal(first.snapshot.height, 844);
  for (let mount = 0; mount < 10; mount++) {
    const next = new CameraPreviewLayout(mount % 2 ? { width: 844, height: 390 } : portrait, true);
    const { width, height } = next.snapshot;
    next.cameraReady();
    assert.equal(next.layout(width, height).phase, 'expand');
    assert.equal(next.layout(width, height + 1).phase, 'restore');
    assert.equal(next.layout(width, height).ready, true);
    next.retire();
  }
  assert.equal(first.snapshot, original);
  assert.deepEqual(original, { ...portrait, phase: 'measuring', ready: false });
  for (const bounds of [{ width: 0, height: 10 }, { width: 20, height: -1 }, { width: Infinity, height: 10 }]) {
    assert.throws(() => new CameraPreviewLayout(bounds, true), RangeError);
  }
});
