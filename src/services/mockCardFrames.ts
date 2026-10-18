import type { CardFrame, CardFrameSource } from './contracts';
export const DEMO_SCAN_CARDS = ['base1-4', 'swsh7-215', 'sv6-214', 'xy12-35', 'xy12-35-reverse'] as const;
/** Deterministic presentations, independent of actual camera pixels. */
export class MockCardFrameSource implements CardFrameSource {
  cardId: string | null = null;
  automatic = false;
  private index = -1;
  private nextAt = Infinity;
  constructor(private readonly changed: (cardId: string | null, automatic: boolean) => void) {}
  private notify() { this.changed(this.cardId, this.automatic); }
  next() { this.index = (this.index + 1) % DEMO_SCAN_CARDS.length; this.cardId = DEMO_SCAN_CARDS[this.index]; this.nextAt = Date.now() + 3200; this.notify(); }
  remove() { this.automatic = false; this.cardId = null; this.notify(); }
  presentSame() { this.automatic = false; this.cardId = DEMO_SCAN_CARDS[Math.max(0, this.index)]; this.notify(); }
  setAutomatic(value: boolean) { this.automatic = value; if (value && !this.cardId) this.next(); this.nextAt = Date.now() + 3200; this.notify(); }
  start(onFrame: (frame: CardFrame | null) => void): () => void {
    const timer = setInterval(() => {
      const timestamp = Date.now();
      if (this.automatic && timestamp >= this.nextAt) this.next();
      onFrame(this.cardId ? { fingerprint: this.cardId, cardId: this.cardId, timestamp } : null);
    }, 100);
    return () => clearInterval(timer);
  }
}
