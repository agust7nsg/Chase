import type { SecureKeyValue } from './secureStorage';
import type { SupabaseConfig } from './config';
import { accountFetch } from './fetch';
export type DeletionJob = { ownerId: string; operationId: string; proof: string; status: 'pending' | 'confirmed' };
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export class DeletionError extends Error {
  constructor(readonly code: string, readonly notDeleted = false) { super(code); }
}
export function deletionMessage(cause: unknown): string {
  const code = cause instanceof DeletionError ? cause.code : '';
  if (code === 'reauth_required' || code === 'sign_in_required' || code === 'request_expired') return 'Sign in again with Google, then return here to confirm deletion.';
  if (code === 'not_configured' || code === 'NOT_FOUND') return 'Account deletion is unavailable. Deploy the function, then retry this request.';
  return 'Deletion could not be confirmed. Keep this device and retry to check the result. Your local cards have not been removed.';
}
/** Private durable intent survives a lost success response. No proof is stored with collection data. */
export class AccountDeletion {
  job: DeletionJob | null = null;
  private active = false;
  constructor(private storage: SecureKeyValue, private key: string, private changed: () => void) {}
  async load() {
    const value = await this.storage.getItem(this.key);
    if (!value) return;
    const job = JSON.parse(value) as DeletionJob;
    if (!uuid.test(job.ownerId) || !uuid.test(job.operationId) || !/^[a-f0-9]{64}$/.test(job.proof) || !['pending','confirmed'].includes(job.status)) throw new Error('Invalid deletion recovery data.');
    this.job = job; this.changed();
  }
  async run(owner: string, create: () => DeletionJob, submit: (job: DeletionJob) => Promise<void>) {
    if (this.active) throw new Error('Deletion is already running.');
    this.active = true;
    try {
      if (this.job && this.job.ownerId !== owner) throw new Error('A different deletion must be completed first.');
      if (!this.job) {
        const job = create();
        if (job.ownerId !== owner) throw new Error('Account changed.');
        await this.storage.setItem(this.key, JSON.stringify(job)); this.job = job; this.changed();
      }
      if (this.job.status === 'confirmed') return;
      // A second in-flight/retried request may have already authorized deletion.
      // Keep the intent even on a preflight rejection; never infer cancellation.
      await submit(this.job);
      const confirmed: DeletionJob = { ...this.job, status: 'confirmed' };
      await this.storage.setItem(this.key, JSON.stringify(confirmed)); this.job = confirmed; this.changed();
    } finally { this.active = false; }
  }
  async finish() { if (this.job?.status !== 'confirmed') throw new Error('Deletion is not confirmed.'); await this.storage.removeItem(this.key); this.job = null; this.changed(); }
}
export async function submitAccountDeletion(config: SupabaseConfig, job: DeletionJob, token: string | null, transport: typeof fetch = globalThis.fetch) {
  const result = await accountFetch(transport, 30000)(`${config.url}/functions/v1/delete-account`, {
    method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ownerId: job.ownerId, operationId: job.operationId, proof: job.proof, confirmation: 'DELETE' }),
  });
  const body = await result.json();
  if (!result.ok) throw new DeletionError(typeof body?.error?.code === 'string' ? body.error.code : 'unavailable', body?.error?.notDeleted === true);
  if (body.deleted !== true || body.ownerId !== job.ownerId || body.operationId !== job.operationId) throw new DeletionError('invalid_response');
}

export async function deletionDeadline<T>(request: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([request, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Deletion cleanup needs a retry.')), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
