import assert from 'node:assert/strict';
import test from 'node:test';
import { scannerCrop, scannerGuide, thumbnailBytes } from '../src/services/scannerImages';
import { developmentScannerConfig } from '../src/services/cardsight/config';

test('camera crop follows the centered portrait guide in portrait and landscape cover previews', () => {
  for (const [photo, preview] of [
    [{ width: 1920, height: 1080 }, { width: 390, height: 550 }],
    [{ width: 1080, height: 1920 }, { width: 844, height: 390 }],
  ]) {
    const crop = scannerCrop(photo, preview);
    assert.ok(crop.width > 0 && crop.height > 0);
    assert.ok(crop.originX >= 0 && crop.originX + crop.width <= photo.width);
    assert.ok(crop.originY >= 0 && crop.originY + crop.height <= photo.height);
    assert.ok(Math.abs(crop.width / crop.height - 64 / 88) < 0.01);
  }
  assert.throws(() => scannerCrop({ width: 0, height: 0 }, { width: 390, height: 500 }));
  assert.ok(scannerGuide(320, 500).width <= 320);
});

test('small thumbnail bytes decode without Buffer and reject malformed/oversize input', () => {
  assert.deepEqual([...thumbnailBytes('AP/9')], [0, 255, 253]);
  assert.deepEqual([...thumbnailBytes('AQ==')], [1]);
  assert.deepEqual([...thumbnailBytes('AQI=')], [1, 2]);
  assert.throws(() => thumbnailBytes('not valid!'));
  assert.throws(() => thumbnailBytes('A'.repeat(100004)));
});

test('prototype proxy config is development-only and never targets the vendor or arbitrary cleartext hosts', () => {
  assert.equal(developmentScannerConfig(false, 'https://scanner.example.com', 'test-pairing'), null);
  assert.equal(developmentScannerConfig(true, 'https://api.cardsight.ai', 'test-pairing'), null);
  assert.equal(developmentScannerConfig(true, 'http://public.example.com', 'test-pairing'), null);
  assert.equal(developmentScannerConfig(true, 'http://192.168.1.10:8787', ''), null);
  assert.equal(developmentScannerConfig(true, 'http://192.168.1.10:8787', 'test-pairing')?.proxyUrl, 'http://192.168.1.10:8787');
  assert.equal(developmentScannerConfig(true, 'http://user:pass@localhost:8787', 'test-pairing'), null);
});
