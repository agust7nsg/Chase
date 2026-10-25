export type CameraPreviewPhase = 'measuring' | 'expand' | 'restore' | 'ready' | 'retired';
export type CameraPreviewSnapshot = Readonly<{
  width: number;
  height: number;
  phase: CameraPreviewPhase;
  ready: boolean;
}>;

const validDimension = (value: number) => Number.isFinite(value) && value > 0;
const matches = (actual: number, expected: number) => validDimension(actual) && Math.abs(actual - expected) <= 0.5;

/**
 * One mounted preview owns this handshake. Camera-open alone does not establish
 * layout readiness. Android must measure an expanded and then restored surface
 * before capture begins, forcing its cached native dimensions to change.
 * This confirms layout callbacks, not the contents of the native camera pixels.
 */
export class CameraPreviewLayout {
  private readonly bounds: Readonly<{ width: number; height: number }>;
  private opened = false;
  private measured = false;
  private value: CameraPreviewSnapshot;

  constructor(bounds: { width: number; height: number }, private readonly reflow: boolean) {
    if (!validDimension(bounds.width) || !validDimension(bounds.height)) throw new RangeError('Camera preview dimensions must be finite and positive.');
    this.bounds = Object.freeze({ width: bounds.width, height: bounds.height });
    this.value = this.makeSnapshot('measuring');
  }

  get snapshot(): CameraPreviewSnapshot { return this.value; }

  cameraReady(): CameraPreviewSnapshot {
    if (this.finished) return this.value;
    this.opened = true;
    return this.advance();
  }

  layout(width: number, height: number): CameraPreviewSnapshot {
    if (this.finished) return this.value;
    this.measured = matches(width, this.value.width) && matches(height, this.value.height);
    return this.advance();
  }

  retire(): CameraPreviewSnapshot {
    if (this.value.phase === 'retired') return this.value;
    this.opened = false;
    this.measured = false;
    this.value = this.makeSnapshot('retired');
    return this.value;
  }

  private get finished() { return this.value.phase === 'retired' || this.value.phase === 'ready'; }

  private advance(): CameraPreviewSnapshot {
    if (!this.opened || !this.measured) return this.value;
    const phase = this.value.phase;
    this.value = this.makeSnapshot(phase === 'measuring' ? this.reflow ? 'expand' : 'ready' : phase === 'expand' ? 'restore' : 'ready');
    // Every new target needs its own layout event. An old size cannot satisfy a
    // subsequent phase, even if camera-ready fires more than once.
    this.measured = false;
    return this.value;
  }

  private makeSnapshot(phase: CameraPreviewPhase): CameraPreviewSnapshot {
    return Object.freeze({ width: this.bounds.width, height: this.bounds.height + (phase === 'expand' ? 1 : 0), phase, ready: phase === 'ready' });
  }
}
