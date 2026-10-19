import type { CardFrame } from './contracts';
import type { ScannerStatus } from '../types/scanner';

/** Pure, clock-driven gate. Video frames never directly trigger repeated requests. */
export class ScannerController {
  readonly stabilityMs = 450;
  readonly absenceMs = 350;
  readonly cooldownMs = 1200;
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
  constructor(private identify: (frame: CardFrame, signal: AbortSignal) => Promise<string>, private readonly changed: (status: ScannerStatus) => void) {}
  setRecognizer(identify: (frame: CardFrame, signal: AbortSignal) => Promise<string>) { this.identify = identify; }
  private publish(phase: ScannerStatus['phase'], cardId = this.status.cardId, error: string | null = null) {
    if (this.status.phase === phase && this.status.cardId === cardId && this.status.error === error) return;
    this.status = { phase, cardId, error }; this.changed(this.status);
  }
  resume() { this.active = true; this.candidate = null; this.absentSince = null; if (this.status.phase !== 'ERROR') this.publish(this.acceptedFingerprint ? 'WAITING_FOR_CARD_CHANGE' : 'SEARCHING'); }
  pause() { this.active = false; this.generation++; this.flight?.abort(); this.candidate = null; if (this.status.phase === 'IDENTIFYING') this.publish('SEARCHING', null); }
  dispose() { this.pause(); }
  tick(now: number) { if (this.active && this.status.phase === 'RESULT_READY' && now >= this.resultUntil) this.publish('WAITING_FOR_CARD_CHANGE'); }
  retry() { if (this.flight) return; this.candidate = null; this.acceptedFingerprint = null; this.publish('SEARCHING', null); }
  observe(frame: CardFrame | null, now: number) {
    if (!this.active) return;
    if (!frame) {
      this.candidate = null;
      this.absentSince ??= now;
      if (now - this.absentSince >= this.absenceMs) {
        // A result for a card that has already left is stale.
        if (this.flight) { this.generation++; this.flight.abort(); }
        this.acceptedFingerprint = null;
        if (!this.flight && this.status.phase !== 'ERROR' && now >= this.resultUntil) this.publish('SEARCHING', null);
      }
      return;
    }
    this.absentSince = null;
    if (this.status.phase === 'RESULT_READY' && now >= this.resultUntil) this.publish('WAITING_FOR_CARD_CHANGE');
    if (this.flight || this.status.phase === 'ERROR') return;
    if (frame.fingerprint === this.acceptedFingerprint) { this.candidate = null; return; }
    if (this.candidate?.fingerprint !== frame.fingerprint) {
      this.candidate = frame; this.candidateSince = now; this.publish('CARD_CANDIDATE', null); return;
    }
    if (now - this.candidateSince < this.stabilityMs || now - this.lastAttempt < this.cooldownMs) return;
    this.lastAttempt = now;
    const controller = new AbortController(); this.flight = controller;
    const generation = this.generation;
    this.publish('IDENTIFYING', null);
    void this.identify(frame, controller.signal).then(cardId => {
      if (controller.signal.aborted || generation !== this.generation || !this.active) return;
      this.acceptedFingerprint = frame.fingerprint; this.resultUntil = Date.now() + 1800;
      this.publish('RESULT_READY', cardId);
    }).catch(error => {
      if (!controller.signal.aborted && generation === this.generation && this.active) this.publish('ERROR', null, error instanceof Error ? error.message : 'Unable to identify this card.');
    }).finally(() => { if (this.flight === controller) this.flight = null; });
  }
}
