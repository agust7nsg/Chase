import type { CardFrame } from './contracts';
import type { ScannerStatus } from '../types/scanner';
import { sameScannerPrinting } from './scannerIdentity';

/** Pure, clock-driven gate. Video frames never directly trigger repeated requests. */
export class ScannerController {
  readonly stabilityMs = 450;
  readonly absenceMs = 350;
  // The local proxy defaults to 1500ms between request starts. Keep headroom
  // after removing the redundant stability delay for already-stable frames.
  readonly cooldownMs = 1600;
  readonly errorDisplayMs = 2000;
  status: ScannerStatus = { phase: 'SEARCHING', cardId: null, error: null };
  private candidate: CardFrame | null = null;
  private candidateSince = 0;
  private absentSince: number | null = null;
  private acceptedFingerprint: string | null = null;
  private lastAttempt = -Infinity;
  private flight: AbortController | null = null;
  private active = false;
  private generation = 0;
  private resultUntil = 0;
  private failedFingerprint: string | null = null;
  private lastIdentifiedCardId: string | null = null;
  private request: { frame: CardFrame; previousCardId: string | null; committedCardId: string | null } | null = null;
  private manualRecovery = false;
  private errorUntil = 0;
  constructor(private identify: (frame: CardFrame, signal: AbortSignal) => Promise<string>, private readonly changed: (status: ScannerStatus) => void,
    private readonly now: () => number = Date.now) {}
  setRecognizer(identify: (frame: CardFrame, signal: AbortSignal) => Promise<string>) { this.identify = identify; }
  /** Readiness for expensive image encoding, never a recognition request per video frame. */
  canIdentify(frame: CardFrame, now: number): boolean {
    this.tick(now);
    return this.active && !this.flight && this.status.phase !== 'ERROR'
      && frame.fingerprint !== this.acceptedFingerprint && frame.fingerprint !== this.failedFingerprint
      && now - this.lastAttempt >= this.cooldownMs;
  }
  shouldStageResult(frame: CardFrame, cardId: string): boolean {
    const previous = this.request?.frame === frame ? this.request.previousCardId : this.lastIdentifiedCardId;
    return frame.newPresentation !== false || !sameScannerPrinting(previous, cardId);
  }
  get heldCardId(): string | null { return this.lastIdentifiedCardId; }
  /** A completed durable write remains accounted for even if navigation canceled its UI. */
  acknowledgeCommitted(frame: CardFrame, cardId: string): void {
    if (this.request?.frame !== frame || this.request.committedCardId !== null) return;
    this.request.committedCardId = cardId;
    this.lastIdentifiedCardId = cardId;
    this.acceptedFingerprint = frame.fingerprint;
  }
  private publish(phase: ScannerStatus['phase'], cardId = this.status.cardId, error: string | null = null) {
    if (this.status.phase === phase && this.status.cardId === cardId && this.status.error === error) return;
    this.status = { phase, cardId, error }; this.changed(this.status);
  }
  resume() { this.active = true; this.candidate = null; this.absentSince = null; if (this.status.phase !== 'ERROR') this.publish(this.acceptedFingerprint ? 'WAITING_FOR_CARD_CHANGE' : 'SEARCHING'); }
  pause() { this.active = false; this.generation++; this.flight?.abort(); this.candidate = null; if (this.status.phase === 'IDENTIFYING') this.publish('SEARCHING', null); }
  dispose() { this.pause(); }
  tick(now: number) {
    if (!this.active) return;
    if (this.status.phase === 'RESULT_READY' && now >= this.resultUntil) this.publish('WAITING_FOR_CARD_CHANGE');
    // Hide transient feedback automatically, without clearing the presentation
    // lock. Waiting for another card must not upload the same failed photo again.
    if (this.status.phase === 'ERROR' && !this.manualRecovery && now >= this.errorUntil) this.publish('SEARCHING', null);
  }
  retry() { if (this.flight) return; this.candidate = null; this.acceptedFingerprint = null; this.failedFingerprint = null; this.manualRecovery = false; this.errorUntil = 0; this.publish('SEARCHING', null); }
  observe(frame: CardFrame | null, now: number, confirmedAbsence = false, allowIdentification = true) {
    if (!this.active) return;
    this.tick(now);
    if (!frame) {
      this.candidate = null;
      this.absentSince ??= now;
      if (confirmedAbsence || now - this.absentSince >= this.absenceMs) {
        // A submitted photo still belongs to this session when the physical card
        // leaves. Navigation, not removal, cancels an identification in flight.
        this.acceptedFingerprint = null;
        if (!this.manualRecovery) this.failedFingerprint = null;
        if (!this.flight && !this.manualRecovery && now >= this.resultUntil && this.status.phase !== 'ERROR') this.publish('SEARCHING', null);
      }
      return;
    }
    this.absentSince = null;
    if (this.flight) return;
    // Every transient error gets a readable confirmation interval, even if the
    // user has already switched cards. Authentication/quota failures stay blocked.
    if (this.status.phase === 'ERROR') return;
    if (frame.fingerprint === this.acceptedFingerprint || frame.fingerprint === this.failedFingerprint) { this.candidate = null; return; }
    if (this.candidate?.fingerprint !== frame.fingerprint) {
      this.candidate = frame; this.candidateSince = now; this.publish('CARD_CANDIDATE', null);
      if (!frame.stable) return;
    }
    if (!allowIdentification || (!frame.stable && now - this.candidateSince < this.stabilityMs) || now - this.lastAttempt < this.cooldownMs) return;
    this.lastAttempt = now;
    this.failedFingerprint = null;
    this.manualRecovery = false;
    const controller = new AbortController(); this.flight = controller;
    const request = { frame, previousCardId: this.lastIdentifiedCardId, committedCardId: null as string | null };
    this.request = request;
    this.candidate = null;
    const generation = this.generation;
    this.publish('IDENTIFYING', null);
    void this.identify(frame, controller.signal).then(cardId => {
      if (controller.signal.aborted || generation !== this.generation || !this.active) return;
      const stage = this.shouldStageResult(frame, cardId);
      this.lastIdentifiedCardId = cardId;
      this.acceptedFingerprint = frame.fingerprint; this.resultUntil = this.now() + 1800;
      this.publish(stage ? 'RESULT_READY' : 'WAITING_FOR_CARD_CHANGE', cardId);
    }).catch(error => {
      if (!controller.signal.aborted && generation === this.generation && this.active) {
        this.failedFingerprint = frame.fingerprint;
        this.manualRecovery = Boolean(error && typeof error === 'object' && 'recovery' in error && error.recovery === 'manual');
        this.errorUntil = this.now() + this.errorDisplayMs;
        this.publish('ERROR', null, error instanceof Error ? error.message : 'Unable to identify this card.');
      }
    }).finally(() => {
      if (this.flight !== controller) return;
      this.flight = null;
      this.request = null;
      if (request.committedCardId && this.active && this.status.phase === 'SEARCHING' && this.acceptedFingerprint) {
        this.publish('WAITING_FOR_CARD_CHANGE', request.committedCardId);
      }
    });
  }
}
