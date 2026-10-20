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
/** Native capture cannot be canceled; eventual cleanup still runs after this deadline. */
export async function cameraDeadline<T>(operation: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new CameraCaptureTimeout()), timeoutMs);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export function scannerPictureSize(sizes: readonly string[]): string | undefined {
  return sizes.map(value => {
    const match = /^(\d+)x(\d+)$/.exec(value);
    return { value, area: match ? Number(match[1]) * Number(match[2]) : 0 };
  }).filter(item => Number.isSafeInteger(item.area) && item.area >= 1280 * 720)
    .sort((a, b) => a.area - b.area)[0]?.value;
}
