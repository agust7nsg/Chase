import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCardPixels, cardSignatureDistance, LiveCardPresentationTracker, type CardPixelInput, type CardPixelObservation } from '../src/services/liveCardFrames';
import { ScannerController } from '../src/services/scannerController';

/** Small deterministic camera-like fixtures: border, title, art, rules and text. */
function cardPixels(style = 0, options: { shift?: number; brightness?: number; noise?: number } = {}): CardPixelInput {
  const width = 64;
  const height = 88;
  const data = new Uint8Array(width * height * 4);
  const shift = options.shift ?? 0;
  const backgrounds = [[160, 55, 25], [30, 85, 165], [55, 120, 55]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cx = x - shift;
    const cy = y - shift;
    let rgb = [185, 179, 170];
    if (cx >= 6 && cx <= 57 && cy >= 5 && cy <= 82) {
      rgb = [235, 200, 65];
      if (cx >= 9 && cx <= 54 && cy >= 8 && cy <= 79) {
        rgb = [215, 205, 175];
        if (cy >= 17 && cy <= 53) {
          rgb = [...backgrounds[style]];
          const dx = cx - (style === 1 ? 24 : 36);
          const dy = cy - (style === 2 ? 43 : 31);
          if (dx * dx / 190 + dy * dy / 150 < 1) rgb = style === 0 ? [240, 150, 40] : style === 1 ? [170, 80, 205] : [80, 195, 190];
          if ((cx + cy * 2 + style * 7) % 17 < 2) rgb = rgb.map(value => value + 20);
        }
        if (cy >= 11 && cy <= 13 && cx >= 16 && cx <= 44) rgb = [35, 30, 30];
        if (cy >= 58 && cy % 5 === 0 && cx >= 13 && cx <= 48 - cy % 9) rgb = [65, 60, 55];
        if (cy === 76 && cx >= 14 && cx <= 45) rgb = [45, 40, 35];
      }
    }
    const p = (y * width + x) * 4;
    const noise = ((x * 31 + y * 17) % 7 - 3) * (options.noise ?? 0);
    for (let channel = 0; channel < 3; channel++) data[p + channel] = Math.max(0, Math.min(255, rgb[channel] + (options.brightness ?? 0) + noise));
    data[p + 3] = 255;
  }
  return { width, height, data };
}

function blankPixels(noise = 0): CardPixelInput {
  const width = 64;
  const height = 88;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const value = 160 + (i * 13 % 7 - 3) * noise;
    data[i * 4] = value; data[i * 4 + 1] = value; data[i * 4 + 2] = value; data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function blurredPixels(input: CardPixelInput): CardPixelInput {
  const { width, height } = input;
  let source = input.data;
  for (let pass = 0; pass < 4; pass++) {
    const result = new Uint8Array(source.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const total = [0, 0, 0];
      let count = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const p = (Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
        for (let channel = 0; channel < 3; channel++) total[channel] += source[p + channel];
        count++;
      }
      const p = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) result[p + channel] = total[channel] / count;
      result[p + 3] = 255;
    }
    source = result;
  }
  return { width, height, data: source };
}

const observed = (style = 0, options?: Parameters<typeof cardPixels>[1]) => analyzeCardPixels(cardPixels(style, options));
const empty = () => analyzeCardPixels(blankPixels(0.5));
const fingerprint = (value: ReturnType<LiveCardPresentationTracker['observe']>) => {
  assert.ok(value);
  return value.fingerprint;
};

test('local analysis finds a framed card and positively identifies a blank scene', () => {
  const card = observed();
  assert.equal(card.presence, 'card');
  assert.equal(card.quality, 'ready');
  assert.equal(card.signature?.length, 240);
  assert.equal(empty().presence, 'empty');
  assert.equal(empty().signature, null);
});

test('perceptual descriptors tolerate exposure, small translation and sensor noise', () => {
  const original = observed();
  const changed = observed(0, { shift: 1, brightness: 10, noise: 1 });
  assert.equal(changed.presence, 'card');
  assert.ok(cardSignatureDistance(original.signature!, changed.signature!) < 0.16);
  assert.ok(cardSignatureDistance(original.signature!, observed(1).signature!) > 0.30);
});

test('blur and invalid pixel buffers do not confidently report a usable card or absence', () => {
  const blurred = analyzeCardPixels(blurredPixels(cardPixels()));
  assert.notEqual(blurred.quality, 'ready');
  assert.equal(blurred.signature, null);
  assert.equal(analyzeCardPixels({ width: 64, height: 88, data: new Uint8Array(4) }).presence, 'uncertain');
  assert.equal(analyzeCardPixels({ width: 0, height: 0, data: new Uint8Array() }).presence, 'uncertain');
});

test('a stationary presentation keeps one token despite mild noise and movement', () => {
  const tracker = new LiveCardPresentationTracker();
  assert.equal(tracker.observe(observed(), 0), undefined);
  const token = fingerprint(tracker.observe(observed(), 650));
  for (let time = 1300; time <= 13000; time += 650) {
    assert.equal(fingerprint(tracker.observe(observed(0, { shift: time % 2, noise: 1, brightness: 8 }), time)), token);
  }
});

test('a stable different artwork changes the token while one-frame flicker does not', () => {
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(observed(), 0);
  const first = fingerprint(tracker.observe(observed(), 650));
  assert.equal(tracker.observe(observed(1), 1300), undefined);
  assert.equal(fingerprint(tracker.observe(observed(), 1950)), first);
  assert.equal(tracker.observe(observed(1), 2600), undefined);
  assert.notEqual(fingerprint(tracker.observe(observed(1), 3250)), first);
});

test('genuine sustained removal permits the exact same printing to be presented again', () => {
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(observed(), 0);
  const first = fingerprint(tracker.observe(observed(), 650));
  assert.equal(tracker.observe(empty(), 1300), undefined);
  assert.equal(tracker.observe(empty(), 1950), null);
  assert.equal(tracker.observe(observed(), 2600), undefined);
  assert.notEqual(fingerprint(tracker.observe(observed(), 3250)), first);
});

test('one empty image, blur and capture failures never rearm a stationary card', () => {
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(observed(), 0);
  const first = fingerprint(tracker.observe(observed(), 650));
  assert.equal(tracker.observe(empty(), 1300), undefined);
  assert.equal(fingerprint(tracker.observe(observed(), 1950)), first);
  assert.equal(tracker.observe(null, 2600), undefined);
  assert.equal(tracker.observe(analyzeCardPixels(blurredPixels(cardPixels())), 3250), undefined);
  assert.equal(fingerprint(tracker.observe(observed(), 3900)), first);
});

test('pause/resume and large capture gaps discard candidates but preserve the accepted lock', () => {
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(observed(), 0);
  const first = fingerprint(tracker.observe(observed(), 650));
  tracker.observe(empty(), 1300);
  tracker.resetCandidates();
  assert.equal(fingerprint(tracker.observe(observed(), 60000)), first);
  assert.equal(tracker.observe(empty(), 60650), undefined);
  assert.equal(tracker.observe(empty(), 70000), undefined, 'elapsed downtime is not evidence of sustained absence');
  assert.equal(fingerprint(tracker.observe(observed(), 70650)), first);
});

test('uncertain framing and medium visual change preserve the lock without emitting absence', () => {
  const tracker = new LiveCardPresentationTracker();
  const original = observed();
  tracker.observe(original, 0);
  const first = fingerprint(tracker.observe(original, 650));
  const uncertain: CardPixelObservation = { ...original, presence: 'uncertain', signature: null };
  assert.equal(tracker.observe(uncertain, 1300), undefined);
  const medium: CardPixelObservation = { ...original, signature: original.signature!.map(value => value + 0.22) };
  assert.equal(tracker.observe(medium, 1950), undefined);
  assert.equal(tracker.observe(medium, 2600), undefined);
  assert.equal(fingerprint(tracker.observe(original, 3250)), first);
});

test('tracker plus existing scanner gate recognizes once per deliberate physical presentation', async () => {
  const tracker = new LiveCardPresentationTracker();
  let requests = 0;
  const controller = new ScannerController(async () => { requests++; return 'tcgdex:en:base1-4:holo'; }, () => {});
  const base = Date.now();
  controller.resume();
  const advance = async (observation: CardPixelObservation | null, time: number) => {
    const frame = tracker.observe(observation, base + time);
    if (frame !== undefined) controller.observe(frame, base + time);
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  for (let time = 0; time <= 6500; time += 650) await advance(observed(0, { noise: 1 }), time);
  assert.equal(requests, 1);
  await advance(empty(), 7150);
  await advance(empty(), 7800);
  await advance(observed(), 8450);
  await advance(observed(), 9100);
  await advance(observed(), 9750);
  assert.equal(requests, 2);
  controller.dispose();
});
