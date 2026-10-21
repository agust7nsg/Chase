export interface SecureKeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
interface Manifest { version: 1; generation: string; parts: number }
class CorruptAuthManifest extends Error {}

/** Native SecureStore values stay ASCII and below historical iOS value limits.
 * New chunks precede the atomic manifest switch; failed writes preserve the old session.
 * No credential is copied to collection storage or to an unencrypted fallback. */
export class ChunkedAuthStorage implements SecureKeyValue {
  private queue: Promise<unknown> = Promise.resolve();
  private sequence = 0;
  constructor(private readonly secure: SecureKeyValue) {}
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation); this.queue = next.catch(() => {}); return next;
  }
  private base(key: string) {
    if (!/^[A-Za-z0-9._-]{1,180}$/.test(key)) throw new Error('Invalid account storage key.');
    return `chase.${key}`;
  }
  private async manifest(base: string): Promise<Manifest | null> {
    const raw = await this.secure.getItem(`${base}.manifest`);
    if (raw === null) return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new CorruptAuthManifest('Account storage needs recovery.'); }
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('generation' in value) || typeof value.generation !== 'string' || !/^[a-z0-9-]{1,100}$/.test(value.generation)
      || !('parts' in value) || !Number.isSafeInteger(value.parts) || Number(value.parts) < 1 || Number(value.parts) > 128) throw new CorruptAuthManifest('Account storage needs recovery.');
    return value as Manifest;
  }
  private async clean(base: string, manifest: Manifest | null) {
    if (!manifest) return;
    await Promise.allSettled(Array.from({ length: manifest.parts }, (_, i) => this.secure.removeItem(`${base}.${manifest.generation}.${i}`)));
  }
  getItem(key: string): Promise<string | null> {
    return this.serialize(async () => {
      const base = this.base(key); const manifest = await this.manifest(base);
      if (!manifest) return null;
      const parts = await Promise.all(Array.from({ length: manifest.parts }, (_, i) => this.secure.getItem(`${base}.${manifest.generation}.${i}`)));
      if (parts.some(part => part === null || part.length > 1024)) throw new Error('Account storage needs recovery.');
      const result: unknown = JSON.parse(parts.join(''));
      if (typeof result !== 'string') throw new Error('Account storage needs recovery.');
      return result;
    });
  }
  setItem(key: string, value: string): Promise<void> {
    return this.serialize(async () => {
      const base = this.base(key); let previous: Manifest | null = null;
      try { previous = await this.manifest(base); } catch (error) { if (!(error instanceof CorruptAuthManifest)) throw error; }
      const text = JSON.stringify(value).replace(/[\u0080-\uFFFF]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
      const parts = Math.ceil(text.length / 1024);
      if (parts > 128) throw new Error('Account session is too large to store.');
      const next: Manifest = { version: 1, generation: `${Date.now().toString(36)}-${(++this.sequence).toString(36)}-${Math.random().toString(36).slice(2)}`, parts };
      try {
        for (let i = 0; i < parts; i++) await this.secure.setItem(`${base}.${next.generation}.${i}`, text.slice(i * 1024, (i + 1) * 1024));
        await this.secure.setItem(`${base}.manifest`, JSON.stringify(next));
      } catch (error) { await this.clean(base, next); throw error; }
      await this.clean(base, previous);
    });
  }
  removeItem(key: string): Promise<void> {
    return this.serialize(async () => {
      const base = this.base(key); let previous: Manifest | null = null;
      try { previous = await this.manifest(base); } catch (error) { if (!(error instanceof CorruptAuthManifest)) throw error; }
      await this.secure.removeItem(`${base}.manifest`); await this.clean(base, previous);
    });
  }
}
