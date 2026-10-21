import type { CardFrame, RecognitionImage } from './contracts';
import type { CardPixelObservation } from './liveCardFrames';
import { LiveCardPresentationTracker } from './liveCardFrames';
import { ScannerController } from './scannerController';

export interface CameraSample {
  observation: CardPixelObservation;
  image?: RecognitionImage;
  timings: { captureMs: number; analysisMs: number; uploadMs: number; totalMs: number };
}
export type SampleCamera = (shouldUpload: (observation: CardPixelObservation) => boolean) => Promise<CameraSample | undefined>;

/** One local sampler remains active while recognition/catalog work runs independently. */
export class LiveScannerPipeline {
  private running = false;
  private generation = 0;
  private samplingGeneration: number | null = null;
  constructor(readonly controller: ScannerController, readonly tracker: LiveCardPresentationTracker,
    private allowed: () => boolean, private readonly now: () => number = Date.now) {}
  setAllowed(allowed: () => boolean) { this.allowed = allowed; }
  start() { this.running = true; this.controller.resume(); this.tracker.resetCandidates(); }
  stop() { this.running = false; this.generation++; this.controller.pause(); this.tracker.resetCandidates(); }
  async sample(camera: SampleCamera): Promise<CameraSample | undefined> {
    if (!this.running || this.samplingGeneration === this.generation || !this.allowed()) return;
    const generation = this.generation;
    this.samplingGeneration = generation;
    const captureVersion = this.tracker.captureVersion;
    const startedAt = this.now();
    let frame: CardFrame | null | undefined;
    try {
      const sample = await camera(observation => {
        if (!this.running || generation !== this.generation || !this.allowed()) return false;
        const observedAt = this.now();
        frame = this.tracker.observe(observation, observedAt, captureVersion, startedAt);
        return Boolean(frame && this.controller.canIdentify(frame, observedAt));
      });
      if (!this.running || generation !== this.generation) return;
      if (sample && frame !== undefined) {
        // A request may have completed while native encoding ran. An observation
        // without an upload must still report removal, never start an empty call.
        this.controller.observe(frame ? { ...frame, ...(sample.image ? { image: sample.image } : {}) } : null,
          this.now(), frame === null, Boolean(sample.image) && this.allowed());
      }
      return sample;
    } finally { if (this.samplingGeneration === generation) this.samplingGeneration = null; }
  }
}
