import type { CardFrame } from './contracts';

/** A small, oriented RGBA crop around the alignment guide, including its surroundings. */
export interface CardPixelInput {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface CardPixelObservation {
  presence: 'card' | 'empty' | 'uncertain';
  quality: 'ready' | 'blurred' | 'uncertain';
  /** Normalized spatial colour/contrast descriptor; never an image-byte hash. */
  signature: number[] | null;
  boundary: number;
  detail: number;
  contrast: number;
}

const invalidObservation = (): CardPixelObservation => ({
  presence: 'uncertain', quality: 'uncertain', signature: null, boundary: 0, detail: 0, contrast: 0,
});

/**
 * Conservative local heuristics, not a trained detector or recognition confidence.
 * The card should occupy approximately x=.09–.91/y=.06–.94 of the crop; keep a
 * visible ring of surroundings. A border search tolerates nearby insets. These
 * thresholds require physical-device tuning for sleeves, glare and backgrounds.
 * A textured/ambiguous scene is deliberately uncertain rather than proof of removal.
 */
export function analyzeCardPixels(input: CardPixelInput): CardPixelObservation {
  const { width, height, data } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 24 || height < 32
    || width > 512 || height > 704 || !data || data.length < width * height * 4) return invalidObservation();
  const luminance = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    return data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
  };
  const left = Math.round(width * 0.18);
  const right = Math.round(width * 0.82);
  const top = Math.round(height * 0.14);
  const bottom = Math.round(height * 0.86);
  let sum = 0;
  let squares = 0;
  let laplacian = 0;
  let samples = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const value = luminance(x, y);
    sum += value;
    squares += value * value;
    laplacian += Math.abs(4 * value - luminance(x - 1, y) - luminance(x + 1, y) - luminance(x, y - 1) - luminance(x, y + 1));
    samples++;
  }
  const mean = sum / samples;
  const contrast = Math.sqrt(Math.max(0, squares / samples - mean * mean));
  const detail = laplacian / samples;

  // Signed differences along a complete boundary reject random texture more
  // reliably than counting arbitrary high-contrast pixels in a camera image.
  const line = (vertical: boolean, position: number): number => {
    const differences = [0, 0, 0];
    const limit = vertical ? height : width;
    const inset = Math.round(limit * 0.19);
    let count = 0;
    for (let t = inset; t < limit - inset; t++) {
      const a = vertical ? (t * width + position - 2) * 4 : ((position - 2) * width + t) * 4;
      const b = vertical ? (t * width + position + 2) * 4 : ((position + 2) * width + t) * 4;
      for (let channel = 0; channel < 3; channel++) differences[channel] += data[b + channel] - data[a + channel];
      count++;
    }
    return differences.reduce((total, value) => total + Math.abs(value / count), 0) / 3;
  };
  let vertical = 0;
  let horizontal = 0;
  for (let inset = 0.05; inset <= 0.281; inset += 0.015) {
    const a = Math.max(2, Math.round(width * inset));
    const b = Math.min(width - 3, width - 1 - a);
    vertical = Math.max(vertical, Math.min(line(true, a), line(true, b)));
  }
  for (let inset = 0.03; inset <= 0.281; inset += 0.012) {
    const a = Math.max(2, Math.round(height * inset));
    const b = Math.min(height - 3, height - 1 - a);
    horizontal = Math.max(horizontal, Math.min(line(false, a), line(false, b)));
  }
  const boundary = Math.min(vertical, horizontal);
  const empty = boundary < 8 && contrast < 12 && detail < 5;
  if (empty) return { presence: 'empty', quality: 'uncertain', signature: null, boundary, detail, contrast };
  const present = boundary >= 13 && contrast >= 13;
  const quality = detail >= 3 ? 'ready' : 'blurred';
  if (quality !== 'ready') return { presence: present ? 'card' : 'uncertain', quality, signature: null, boundary, detail, contrast };

  // Cell averages tolerate small translations, sensor noise and JPEG artefacts.
  // Luminance is centered and contrast-normalized; chroma retains card/art colour
  // differences while a neutral exposure shift does not change the signature.
  const signature: number[] = [];
  const scale = Math.max(24, contrast);
  for (let row = 0; row < 10; row++) for (let column = 0; column < 8; column++) {
    const x0 = left + Math.floor((right - left) * column / 8);
    const x1 = left + Math.floor((right - left) * (column + 1) / 8);
    const y0 = top + Math.floor((bottom - top) * row / 10);
    const y1 = top + Math.floor((bottom - top) * (row + 1) / 10);
    const rgb = [0, 0, 0];
    let count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * 4;
      rgb[0] += data[p]; rgb[1] += data[p + 1]; rgb[2] += data[p + 2]; count++;
    }
    const [r, g, b] = rgb.map(value => value / count);
    signature.push((r * 0.299 + g * 0.587 + b * 0.114 - mean) / scale, (r - g) / 128, (b - g) / 128);
  }
  return { presence: present ? 'card' : 'uncertain', quality: 'ready', signature, boundary, detail, contrast };
}

/** Spatial change after removing a uniform exposure/colour shift. */
export function cardStructureDistance(a: readonly number[], b: readonly number[]): number {
  if (!a.length || a.length !== b.length || a.length % 3) return Infinity;
  const shifts = [0, 0, 0];
  for (let i = 0; i < a.length; i++) shifts[i % 3] += b[i] - a[i];
  for (let channel = 0; channel < 3; channel++) shifts[channel] /= a.length / 3;
  return a.reduce((total, value, index) => total + Math.abs(b[index] - value - shifts[index % 3]), 0) / a.length;
}

export function cardSignatureDistance(a: readonly number[], b: readonly number[]): number {
  if (!a.length || a.length !== b.length) return Infinity;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    if (!Number.isFinite(a[index]) || !Number.isFinite(b[index])) return Infinity;
    difference += Math.abs(a[index] - b[index]);
  }
  return difference / a.length;
}

/** Compare the illustration region separately from shared text boxes and frame colours. */
export function cardArtworkDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== 240 || b.length !== 240) return Infinity;
  const regionA: number[] = []; const regionB: number[] = [];
  // The descriptor covers x18–82%/y14–86% of the crop. Its upper five rows
  // and inner six columns emphasize artwork on ordinary common-card layouts.
  for (let row = 0; row < 5; row++) for (let column = 1; column < 7; column++) {
    const start = (row * 8 + column) * 3;
    regionA.push(...a.slice(start, start + 3)); regionB.push(...b.slice(start, start + 3));
  }
  return cardStructureDistance(regionA, regionB);
}

export interface LiveCardTrackerOptions {
  stableMs?: number;
  absenceMs?: number;
  maxObservationGapMs?: number;
  sameThreshold?: number;
  changeThreshold?: number;
  tokenPrefix?: string;
}

/** Ephemeral scalar diagnostics only: never include pixels, signatures or image data. */
export interface LiveCardTrackerDiagnostic {
  reason: string;
  presence?: CardPixelObservation['presence'];
  quality?: CardPixelObservation['quality'];
  boundary?: number;
  detail?: number;
  contrast?: number;
  distance?: number;
  artworkDistance?: number;
  samples?: number;
}

/**
 * Turns similar images into one physical-presentation token. `undefined` means
 * skip the controller observation; `null` means positively confirmed absence.
 * Capture failures/blur never rearm an accepted presentation. A deliberate local
 * reset is available, but navigation should call resetCandidates() instead.
 */
export class LiveCardPresentationTracker {
  private accepted: { signature: number[]; fingerprint: string; newPresentation: boolean } | null = null;
  private candidate: { signature: number[]; since: number; samples: number } | null = null;
  private absentSince: number | null = null;
  private absentSamples = 0;
  private lastObservationAt: number | null = null;
  private lightingUntil: number | null = null;
  private lightingVersion = 0;
  private sequence = 0;
  private latestDiagnostic: LiveCardTrackerDiagnostic = { reason: 'waiting-for-camera' };
  private readonly options: Required<LiveCardTrackerOptions>;

  constructor(options: LiveCardTrackerOptions = {}) {
    this.options = { stableMs: 650, absenceMs: 500, maxObservationGapMs: 2200,
      sameThreshold: 0.16, changeThreshold: 0.30, tokenPrefix: 'camera', ...options };
  }

  resetCandidates(): void {
    this.candidate = null;
    this.absentSince = null;
    this.absentSamples = 0;
    this.lastObservationAt = null;
    this.latestDiagnostic = { reason: 'waiting-for-stable-frame' };
  }

  /**
   * Torch/exposure changes are not a new physical presentation. Ignore their
   * transient dark/glared frames, preserving the accepted token. Afterwards a
   * stable colour change may update its baseline only when spatial artwork is
   * still similar; a different card continues through ordinary stability checks.
   */
  settleLighting(now: number, durationMs = 1200): void {
    if (!Number.isFinite(now) || !Number.isFinite(durationMs)) return;
    this.lightingVersion++;
    this.resetCandidates();
    this.lightingUntil = Math.max(this.lightingUntil ?? now, now + Math.max(0, Math.min(5000, durationMs)));
  }

  /** Snapshot before awaiting capture; an old-lighting photo must not rebase the new exposure. */
  get captureVersion(): number { return this.lightingVersion; }

  get diagnostic(): Readonly<LiveCardTrackerDiagnostic> { return { ...this.latestDiagnostic }; }

  private note(reason: string, observation: CardPixelObservation | null, extra: Partial<LiveCardTrackerDiagnostic> = {}): void {
    this.latestDiagnostic = { reason, ...(observation ? { presence: observation.presence, quality: observation.quality,
      boundary: observation.boundary, detail: observation.detail, contrast: observation.contrast } : {}), ...extra };
  }

  reset(): void { this.resetCandidates(); this.accepted = null; this.lightingUntil = null; this.lightingVersion++; }

  observe(observation: CardPixelObservation | null, now: number, captureVersion = this.lightingVersion, captureStartedAt = now): CardFrame | null | undefined {
    if (!Number.isFinite(now) || !Number.isFinite(captureStartedAt) || captureStartedAt > now) { this.note('invalid-frame-timing', observation); return undefined; }
    if (captureVersion !== this.lightingVersion) { this.note('stale-lighting-frame', observation); return undefined; }
    if (this.lightingUntil !== null && now < this.lightingUntil) { this.note('exposure-settling', observation); return undefined; }
    if (observation === null) { this.resetCandidates(); this.note('capture-unavailable', null); return undefined; }
    // A slow native photo/manipulation operation is still one continuous camera
    // observation. Only idle time BEFORE that capture breaks continuity. Comparing
    // completion times reset every candidate forever on slower/warmer phones.
    if (this.lastObservationAt !== null && (now < this.lastObservationAt || captureStartedAt - this.lastObservationAt > this.options.maxObservationGapMs)) this.resetCandidates();
    this.lastObservationAt = now;
    const texturedAbsence = observation.presence === 'uncertain' && observation.quality === 'ready'
      && observation.boundary < 6 && this.accepted && observation.signature
      && cardSignatureDistance(this.accepted.signature, observation.signature) >= this.options.changeThreshold;
    if (observation.presence === 'empty' || texturedAbsence) {
      this.candidate = null;
      this.absentSince ??= now;
      this.absentSamples++;
      if (this.absentSamples >= (texturedAbsence ? 3 : 2) && now - this.absentSince >= (texturedAbsence ? 1200 : this.options.absenceMs)) {
        this.accepted = null;
        this.lightingUntil = null;
        this.note('card-removed', observation, { samples: this.absentSamples });
        return null;
      }
      this.note('checking-card-removal', observation, { samples: this.absentSamples });
      return undefined;
    }
    this.absentSince = null;
    this.absentSamples = 0;
    const signature = observation.signature;
    // Border confidence is advisory, not identity. Cropped/full-art printings can
    // have a weaker but usable outline; require extra stable evidence for these
    // instead of silently rejecting them forever. Texture with no outline stays
    // uncertain and never becomes a request merely by waiting.
    const weakOutline = observation.presence === 'uncertain' && observation.boundary >= 6
      && observation.contrast >= 18 && observation.detail >= 5;
    if ((observation.presence !== 'card' && !weakOutline) || observation.quality !== 'ready' || !signature?.length
      || signature.some(value => !Number.isFinite(value))) {
      this.candidate = null; this.note(observation.quality === 'blurred' ? 'frame-blurred' : 'outline-not-found', observation); return undefined;
    }
    let requiredStability = weakOutline ? Math.max(1300, this.options.stableMs) : this.options.stableMs;
    let requiredSamples = weakOutline ? 3 : 2;
    let rebaseLighting = false;
    if (this.accepted) {
      const distance = cardSignatureDistance(this.accepted.signature, signature);
      const artworkDistance = cardArtworkDistance(this.accepted.signature, signature);
      const artworkChanged = artworkDistance >= this.options.sameThreshold;
      this.note('checking-card-change', observation, { distance, artworkDistance });
      if (distance <= this.options.sameThreshold && !artworkChanged) {
        this.candidate = null;
        if (this.lightingUntil !== null) {
          this.accepted.signature = [...signature];
          this.lightingUntil = null;
        }
        this.note('holding-current-presentation', observation, { distance, artworkDistance });
        return { fingerprint: this.accepted.fingerprint, timestamp: now, stable: true, newPresentation: this.accepted.newPresentation };
      }
      rebaseLighting = this.lightingUntil !== null && cardStructureDistance(this.accepted.signature, signature) < 0.14;
      if (!rebaseLighting) this.lightingUntil = null;
      // A medium difference may be a tilt, sleeve reflection or framing change.
      // Keep the lock rather than confidently treating it as another card.
      if (!rebaseLighting && distance < this.options.changeThreshold) {
        if (!artworkChanged && cardStructureDistance(this.accepted.signature, signature) < 0.14) { this.candidate = null; this.note('exposure-or-small-movement', observation, { distance, artworkDistance }); return undefined; }
        requiredStability = Math.max(artworkChanged ? 1300 : 1500, requiredStability);
      }
      if (!rebaseLighting && artworkChanged && distance < this.options.changeThreshold) {
        requiredSamples = Math.max(3, requiredSamples);
        requiredStability = Math.max(1300, requiredStability);
      }
    }
    if (!this.candidate || cardSignatureDistance(this.candidate.signature, signature) > this.options.sameThreshold
      || cardArtworkDistance(this.candidate.signature, signature) > this.options.sameThreshold) {
      this.candidate = { signature: [...signature], since: now, samples: 1 };
      this.note(weakOutline ? 'checking-weak-outline' : 'candidate-stabilizing', observation, { samples: 1 });
      return undefined;
    }
    const candidate = this.candidate;
    candidate.samples++;
    if (candidate.samples < requiredSamples || now - candidate.since < requiredStability) {
      this.note(weakOutline ? 'checking-weak-outline' : 'candidate-stabilizing', observation, { samples: candidate.samples }); return undefined;
    }
    const newPresentation = rebaseLighting && this.accepted ? this.accepted.newPresentation : !this.accepted;
    this.accepted = { signature: [...signature], fingerprint: rebaseLighting && this.accepted
      ? this.accepted.fingerprint : `${this.options.tokenPrefix}-${++this.sequence}`, newPresentation };
    this.lightingUntil = null;
    this.candidate = null;
    this.note(rebaseLighting ? 'exposure-rebased' : 'new-presentation-ready', observation, { samples: candidate.samples });
    return { fingerprint: this.accepted.fingerprint, timestamp: now, stable: true, newPresentation };
  }
}
