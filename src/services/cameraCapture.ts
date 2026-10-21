/** A native camera mount owns its capture gate. Late captures cannot unlock a new mount. */
export class CameraCaptureGate {
  private generation = 0;
  private ready = false;
  private busy = false;
  markReady() { this.ready = true; }
  retire() { this.generation++; this.ready = false; this.busy = false; }
  begin(): number | undefined { if (!this.ready || this.busy) return; this.busy = true; return this.generation; }
  current(lease: number) { return this.ready && this.generation === lease; }
  end(lease: number) { if (lease === this.generation) this.busy = false; }
}
export class CameraCaptureTimeout extends Error {
  constructor() { super('Camera capture timed out. Reopen the camera and retry.'); }
}
export class CameraSampleError extends Error {
  constructor(readonly stage: 'capture' | 'analysis' | 'upload') { super(`Camera ${stage} failed.`); }
}
/** Native capture cannot be canceled; eventual cleanup still runs after this deadline. */
export async function cameraDeadline<T>(operation: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new CameraCaptureTimeout()), timeoutMs);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export function scannerPictureSize(sizes: readonly string[]): string | undefined {
  const valid = sizes.map(value => {
    const match = /^(\d+)x(\d+)$/.exec(value);
    return { value, area: match ? Number(match[1]) * Number(match[2]) : 0 };
  }).filter(item => Number.isSafeInteger(item.area) && item.area > 0);
  return valid.filter(item => item.area >= 1280 * 720).sort((a, b) => a.area - b.area)[0]?.value
    ?? valid.sort((a, b) => b.area - a.area)[0]?.value;
}

/** One observation has a short deadline; only a selected image earns upload-encoding time. */
export class CameraSampleDeadline {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reject: ((cause: Error) => void) | undefined;
  private active = false;
  private startedAt = 0;
  constructor(private readonly observationMs = 5000, private readonly uploadMs = 3000) {}
  private arm(milliseconds: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reject?.(new CameraCaptureTimeout()), milliseconds);
  }
  allowUpload() {
    if (!this.active) return;
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= this.observationMs) throw new CameraCaptureTimeout();
    this.arm(Math.min(this.uploadMs, this.observationMs + this.uploadMs - elapsed));
  }
  async run<T>(operation: Promise<T>): Promise<T> {
    this.active = true; this.startedAt = Date.now();
    const expired = new Promise<never>((_resolve, reject) => { this.reject = reject; });
    this.arm(this.observationMs);
    try { return await Promise.race([operation, expired]); }
    finally { this.active = false; this.reject = undefined; if (this.timer) clearTimeout(this.timer); }
  }
}

export interface CameraSample<TObservation, TImage> {
  observation: TObservation;
  image?: TImage;
  analysisMs: number;
  uploadMs: number;
}

/** The cheap observation always precedes the optional, expensive upload image. */
export async function selectiveCameraSample<TObservation, TImage>(options: {
  analyze: () => Promise<TObservation>;
  shouldUpload: (observation: TObservation) => boolean;
  encode: () => Promise<TImage>;
  current: () => boolean;
  onUpload: () => void;
  now?: () => number;
}): Promise<CameraSample<TObservation, TImage> | undefined> {
  const now = options.now ?? Date.now;
  const analysisStarted = now();
  const observation = await options.analyze();
  if (!options.current()) return;
  const analysisMs = now() - analysisStarted;
  if (!options.shouldUpload(observation)) return { observation, analysisMs, uploadMs: 0 };
  if (!options.current()) return;
  options.onUpload();
  const uploadStarted = now();
  const image = await options.encode();
  if (!options.current()) return;
  return { observation, image, analysisMs, uploadMs: now() - uploadStarted };
}
