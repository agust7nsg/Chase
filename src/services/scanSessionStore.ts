import type { ScanSession } from '../types/scanner';
import { createScanSession, restoreScanSession } from './scanSession';

export const SCAN_SESSION_KEY = 'chase.scan-session.v1';
export interface SessionStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> }
/** Single serialized writer. Failed persistence never publishes a successful mutation. */
export class ScanSessionStore {
  private queue: Promise<unknown> = Promise.resolve();
  session: ScanSession;
  loaded = false;
  constructor(private readonly storage: SessionStorage, private readonly id: () => string, private readonly publish: (session: ScanSession) => void) { this.session = createScanSession(id()); }
  async load() {
    const stored = await this.storage.getItem(SCAN_SESSION_KEY);
    this.session = stored === null ? createScanSession(this.id()) : restoreScanSession(JSON.parse(stored), this.id());
    this.loaded = true; this.publish(this.session); return this.session;
  }
  update(transform: (session: ScanSession) => ScanSession): Promise<ScanSession> {
    const operation = this.queue.then(async () => {
      if (!this.loaded) throw new Error('Pending scans are still loading.');
      const next = transform(this.session);
      if (next === this.session) return next;
      await this.storage.setItem(SCAN_SESSION_KEY, JSON.stringify(next));
      this.session = next; this.publish(next); return next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
