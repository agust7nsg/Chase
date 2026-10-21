import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { analyzeCardPixels, cardArtworkDistance, cardSignatureDistance, cardStructureDistance, LiveCardPresentationTracker, type CardPixelInput, type CardPixelObservation } from '../src/services/liveCardFrames';
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

/** A warm exposure/white-balance change, using actual pixels rather than signatures. */
function torchPixels(input: CardPixelInput): CardPixelInput {
  const data = new Uint8Array(input.data);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = Math.min(255, data[p] + 50);
    data[p + 1] = Math.max(0, data[p + 1] - 15);
    data[p + 2] = Math.max(0, data[p + 2] - 25);
  }
  return { ...input, data };
}

const observed = (style = 0, options?: Parameters<typeof cardPixels>[1]) => analyzeCardPixels(cardPixels(style, options));
const empty = () => analyzeCardPixels(blankPixels(0.5));
const fingerprint = (value: ReturnType<LiveCardPresentationTracker['observe']>) => {
  assert.ok(value);
  return value.fingerprint;
};

const artworkFixture = JSON.parse(readFileSync(new URL('./fixtures/card-thumbnails.json', import.meta.url), 'utf8')) as {
  width: number; height: number; cards: { id: string; rgba: string }[];
};
const realArtwork = artworkFixture.cards.map(card => ({ id: card.id, data: inflateSync(Buffer.from(card.rgba, 'base64')) }));
function realCardFrame(card: typeof realArtwork[number], fill: number, options: { shift?: number; brightness?: number; shear?: number; glare?: boolean } = {}): CardPixelInput {
  const width = artworkFixture.width; const height = artworkFixture.height;
  const data = new Uint8Array(width * height * 4);
  const cardWidth = width * fill; const cardHeight = height * fill;
  const left = (width - cardWidth) / 2 + (options.shift ?? 0); const top = (height - cardHeight) / 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const u = (x - left - (options.shear ?? 0) * (y - height / 2)) / cardWidth;
    const v = (y - top) / cardHeight;
    const source = (Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width))) * 4;
    const rgb = u >= 0 && u < 1 && v >= 0 && v < 1 ? [card.data[source], card.data[source + 1], card.data[source + 2]] : [145, 125, 95];
    const glare = options.glare && ((x / width - 0.67) ** 2 + (y / height - 0.3) ** 2 < 0.015) ? 35 : 0;
    for (let channel = 0; channel < 3; channel++) data[p + channel] = Math.max(0, Math.min(255, rgb[channel] + (options.brightness ?? 0) + glare));
    data[p + 3] = 255;
  }
  return { width, height, data };
}

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

test('sustained textured surroundings can prove removal without treating one uncertain frame as an empty scene', () => {
  const tracker = new LiveCardPresentationTracker(); const original = observed();
  tracker.observe(original, 0); const first = fingerprint(tracker.observe(original, 650));
  const wood: CardPixelObservation = { ...original, presence: 'uncertain', boundary: 2,
    signature: original.signature!.map((value, index) => value + (index % 2 ? 0.8 : -0.8)) };
  assert.equal(tracker.observe(wood, 1300), undefined);
  assert.equal(tracker.observe(wood, 1950), undefined);
  assert.equal(tracker.observe(wood, 2600), null);
  assert.equal(tracker.observe(original, 3250), undefined);
  assert.notEqual(fingerprint(tracker.observe(original, 3900)), first);
});

test('similar-colour cards with sustained artwork changes rearm; a uniform tint does not', () => {
  const tracker = new LiveCardPresentationTracker(); const original = observed();
  tracker.observe(original, 0); const first = fingerprint(tracker.observe(original, 650));
  const similar = { ...original, signature: original.signature!.map((value, index) => value + (index % 2 ? 0.22 : -0.22)) };
  assert.equal(tracker.observe(similar, 1300), undefined);
  assert.equal(tracker.observe(similar, 1950), undefined);
  const next = fingerprint(tracker.observe(similar, 2600));
  assert.notEqual(next, first);
  assert.equal(fingerprint(tracker.observe(similar, 3250)), next);
});

test('torch exposure settles without treating transient darkness or a stable warm cast as a new copy', () => {
  const tracker = new LiveCardPresentationTracker();
  const original = observed();
  const illuminated = analyzeCardPixels(torchPixels(cardPixels()));
  assert.equal(illuminated.presence, 'card');
  assert.ok(cardSignatureDistance(original.signature!, illuminated.signature!) > 0.16, 'fixture changes colour beyond the same-card threshold');
  assert.ok(cardStructureDistance(original.signature!, illuminated.signature!) < 0.14, 'artwork structure remains comparable');
  tracker.observe(original, 0);
  const token = fingerprint(tracker.observe(original, 650));
  tracker.settleLighting(1000);
  assert.equal(tracker.observe(empty(), 1100), undefined);
  assert.equal(tracker.observe(empty(), 1750), undefined, 'exposure darkening is not card removal');
  assert.equal(tracker.observe(illuminated, 2300), undefined);
  assert.equal(fingerprint(tracker.observe(illuminated, 2950)), token);
  assert.equal(fingerprint(tracker.observe(illuminated, 3600)), token);
  tracker.settleLighting(4000);
  assert.equal(tracker.observe(original, 5300), undefined);
  assert.equal(fingerprint(tracker.observe(original, 5950)), token, 'turning the torch back off also keeps the presentation');
});

test('lighting changes still allow new artwork and deliberately removed copies after settling', () => {
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(observed(), 0);
  const first = fingerprint(tracker.observe(observed(), 650));
  tracker.settleLighting(1000);
  assert.equal(tracker.observe(observed(1), 1500), undefined);
  assert.equal(tracker.observe(observed(1), 2300), undefined);
  const second = fingerprint(tracker.observe(observed(1), 2950));
  assert.notEqual(second, first, 'new artwork is not swallowed as an exposure change');
  tracker.settleLighting(3300);
  assert.equal(tracker.observe(empty(), 3900), undefined);
  assert.equal(tracker.observe(empty(), 4600), undefined);
  assert.equal(tracker.observe(empty(), 5250), null, 'removal must be observed after exposure settles');
  assert.equal(tracker.observe(observed(1), 5900), undefined);
  assert.notEqual(fingerprint(tracker.observe(observed(1), 6550)), second);
});

test('a photo started before the torch changes cannot erase the exposure guard when it finishes late', () => {
  const tracker = new LiveCardPresentationTracker();
  const original = observed();
  const illuminated = analyzeCardPixels(torchPixels(cardPixels()));
  tracker.observe(original, 0);
  const first = fingerprint(tracker.observe(original, 650));
  const inFlightPhoto = tracker.captureVersion;
  tracker.settleLighting(1000);
  assert.equal(tracker.observe(original, 2600, inFlightPhoto), undefined, 'a slow old-lighting photo arrives after the settle interval');
  const currentExposure = tracker.captureVersion;
  assert.equal(tracker.observe(illuminated, 3250, currentExposure), undefined);
  assert.equal(fingerprint(tracker.observe(illuminated, 3900, currentExposure)), first, 'new lighting still belongs to the accepted physical card');
  assert.equal(fingerprint(tracker.observe(illuminated, 4550, currentExposure)), first);
});

test('twenty presentations remain recognizable when each native capture takes longer than the old observation-gap cutoff', () => {
  const tracker = new LiveCardPresentationTracker();
  let completedAt = 0;
  const tokens = new Set<string>();
  const capture = (observation: CardPixelObservation) => {
    const startedAt = completedAt + 650;
    completedAt = startedAt + 2350;
    return tracker.observe(observation, completedAt, tracker.captureVersion, startedAt);
  };
  for (let index = 0; index < 20; index++) {
    const card = observed(index % 3);
    assert.equal(capture(card), undefined);
    const token = fingerprint(capture(card));
    assert.ok(!tokens.has(token), 'the next physical card gets its own presentation');
    tokens.add(token);
    assert.equal(fingerprint(capture(card)), token, 'slow captures do not duplicate a held card');
  }
  assert.equal(tokens.size, 20);
});

test('slow capture processing still confirms removal and permits another copy without treating idle downtime as removal', () => {
  const tracker = new LiveCardPresentationTracker();
  const card = observed();
  tracker.observe(card, 2350, tracker.captureVersion, 0);
  const first = fingerprint(tracker.observe(card, 5350, tracker.captureVersion, 3000));
  assert.equal(tracker.observe(empty(), 8350, tracker.captureVersion, 6000), undefined);
  assert.equal(tracker.observe(empty(), 11350, tracker.captureVersion, 9000), null, 'two actual slow captures establish removal');
  assert.equal(tracker.observe(card, 14350, tracker.captureVersion, 12000), undefined);
  assert.notEqual(fingerprint(tracker.observe(card, 17350, tracker.captureVersion, 15000)), first);

  assert.equal(tracker.observe(empty(), 20350, tracker.captureVersion, 18000), undefined);
  assert.equal(tracker.observe(empty(), 62350, tracker.captureVersion, 60000), undefined, 'time with no capture remains unobserved');
  assert.equal(fingerprint(tracker.observe(card, 65350, tracker.captureVersion, 63000)), 'camera-2');
});

test('twenty real chase/common printings can follow every other printing across ordinary guide fills', () => {
  const fills = [0.62, 0.72, 0.82, 0.92, 1.05];
  let pairs = 0;
  for (const fill of fills) {
    const observations = realArtwork.map(card => ({ id: card.id, observation: analyzeCardPixels(realCardFrame(card, fill)) }));
    for (const first of observations) for (const next of observations) {
      if (first.id === next.id) continue;
      const tracker = new LiveCardPresentationTracker();
      let initial: ReturnType<LiveCardPresentationTracker['observe']>;
      for (let time = 0; time <= 3250; time += 650) { initial = tracker.observe(first.observation, time); if (initial) break; }
      assert.ok(initial, `${first.id} must be eligible at guide fill ${fill}`);
      let changed: ReturnType<LiveCardPresentationTracker['observe']>;
      for (let time = 3900; time <= 7150; time += 650) { changed = tracker.observe(next.observation, time); if (changed && changed.fingerprint !== initial.fingerprint) break; }
      assert.ok(changed && changed.fingerprint !== initial.fingerprint, `${first.id} → ${next.id} must not remain locked at guide fill ${fill}`);
      pairs++;
    }
  }
  assert.equal(realArtwork.length, 20);
  assert.equal(pairs, 1900);
});

test('real held card artwork tolerates mild hand motion, exposure, tilt and localized glare without adding another copy', () => {
  for (const card of realArtwork) {
    const tracker = new LiveCardPresentationTracker();
    const original = analyzeCardPixels(realCardFrame(card, 0.82));
    tracker.observe(original, 0); const first = fingerprint(tracker.observe(original, 650));
    const movement = [
      realCardFrame(card, 0.82, { shift: 1 }),
      realCardFrame(card, 0.82, { brightness: 12 }),
      realCardFrame(card, 0.82, { shear: 0.025 }),
      realCardFrame(card, 0.82, { glare: true }),
    ];
    let time = 1300;
    for (const frame of movement) for (let held = 0; held < 4; held++) {
      const sample = tracker.observe(analyzeCardPixels(frame), time); time += 650;
      if (sample) assert.equal(sample.fingerprint, first, `${card.id}: movement must retain physical presentation`);
    }
    assert.equal(fingerprint(tracker.observe(original, time)), first);
  }
});

test('a static textured background without a card outline does not become a recognition candidate by waiting', () => {
  const width = 64; const height = 88; const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    // Continuous vertical wood grain has texture but no horizontal card outline.
    const grain = (x % 7 < 3 ? 40 : -35) + (y % 5 - 2);
    data[p] = 150 + grain; data[p + 1] = 110 + grain; data[p + 2] = 70 + grain; data[p + 3] = 255;
  }
  const observation = analyzeCardPixels({ width, height, data });
  assert.equal(observation.presence, 'uncertain');
  const tracker = new LiveCardPresentationTracker();
  for (let now = 0; now <= 60_000; now += 650) assert.equal(tracker.observe(observation, now), undefined);
  assert.equal(tracker.diagnostic.reason, 'outline-not-found');
  assert.deepEqual(Object.keys(tracker.diagnostic).sort(), ['boundary', 'contrast', 'detail', 'presence', 'quality', 'reason']);
});

test('Ivysaur and Metapod no longer remain permanently classified as the same held card', () => {
  const ivysaur = analyzeCardPixels(realCardFrame(realArtwork.find(card => card.id === 'base1-30')!, 0.62));
  const metapod = analyzeCardPixels(realCardFrame(realArtwork.find(card => card.id === 'base1-54')!, 0.62));
  assert.equal(ivysaur.presence, 'card'); assert.equal(metapod.presence, 'card');
  assert.ok(cardSignatureDistance(ivysaur.signature!, metapod.signature!) < 0.16, 'shared green frame/text hid the real illustration change');
  assert.ok(cardArtworkDistance(ivysaur.signature!, metapod.signature!) > 0.16);
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(ivysaur, 0); const first = tracker.observe(ivysaur, 650)!;
  assert.equal(first.newPresentation, true);
  assert.equal(tracker.observe(metapod, 1300), undefined);
  assert.equal(tracker.observe(metapod, 1950), undefined);
  const next = tracker.observe(metapod, 2600)!;
  assert.notEqual(fingerprint(next), first.fingerprint);
  assert.equal(next.newPresentation, false, 'appearance verification is not proof that another physical copy was presented');
  assert.equal(tracker.observe(metapod, 3250)?.fingerprint, next.fingerprint);
});

test('only confirmed card removal turns an appearance verification into a new physical presentation', () => {
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(observed(), 0); assert.equal(tracker.observe(observed(), 650)?.newPresentation, true);
  tracker.observe(observed(1), 1300); const changed = tracker.observe(observed(1), 1950)!;
  assert.equal(changed.newPresentation, false);
  tracker.resetCandidates(); assert.equal(tracker.observe(observed(1), 2600)?.newPresentation, false);
  tracker.observe(empty(), 3250); assert.equal(tracker.observe(empty(), 3900), null);
  tracker.observe(observed(1), 4550); assert.equal(tracker.observe(observed(1), 5200)?.newPresentation, true);
});

test('alternating similar common cards do not become a falsely stable illustration candidate', () => {
  const original = analyzeCardPixels(realCardFrame(realArtwork.find(card => card.id === 'base1-4')!, 0.62));
  const a = analyzeCardPixels(realCardFrame(realArtwork.find(card => card.id === 'base1-30')!, 0.62));
  const b = analyzeCardPixels(realCardFrame(realArtwork.find(card => card.id === 'base1-54')!, 0.62));
  const tracker = new LiveCardPresentationTracker();
  tracker.observe(original, 0); tracker.observe(original, 650);
  for (let index = 0; index < 10; index++) assert.equal(tracker.observe(index % 2 ? a : b, 1300 + index * 650), undefined);
  tracker.observe(a, 7800); tracker.observe(a, 8450);
  assert.ok(tracker.observe(a, 9100));
});
