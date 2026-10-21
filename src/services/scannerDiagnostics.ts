/** Bounded, volatile diagnostic scalars only: no photos, signatures, keys or URLs. */
export class ScannerDiagnostics {
  private events: { elapsed: number; stage: string; values: Record<string, number | string | boolean | null> }[] = [];
  private readonly started: number;
  constructor(private readonly now: () => number = Date.now) { this.started = now(); }
  record(stage: string, values: Record<string, number | string | boolean | null> = {}) {
    this.events.push({ elapsed: this.now() - this.started, stage, values });
    if (this.events.length > 80) this.events.shift();
  }
  report(): string {
    return 'Chase scanner diagnostics v2\n' + this.events.map(event => `${event.elapsed}ms ${event.stage} ${JSON.stringify(event.values)}`).join('\n');
  }
}
