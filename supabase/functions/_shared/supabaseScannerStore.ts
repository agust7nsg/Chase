import { boundedJson, deadline, isRecord, isUserId, type HostedScannerStore, type ScannerOutcome } from './hostedProtocol.ts';

function outcome(value: unknown): ScannerOutcome {
  if (!isRecord(value) || !Number.isInteger(value.status) || Number(value.status) < 200 || Number(value.status) > 599 || !isRecord(value.body)) throw new Error('Invalid scanner receipt.');
  return { status: Number(value.status), body: value.body };
}

/** Service-role credential exists only in Edge Function environment; never accepts a caller-supplied user ID. */
export function supabaseScannerDependencies(url: string, serviceKey: string, fetcher: typeof fetch = fetch) {
  const project = new URL(url);
  if (project.protocol !== 'https:' || project.username || project.password || project.search || project.hash || project.port
    || !/^[a-z0-9]{20}\.supabase\.co$/.test(project.hostname) || !['', '/'].includes(project.pathname) || !serviceKey) throw new Error('Invalid server Supabase configuration.');
  const root = project.origin;
  async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    return deadline(async signal => {
      const response = await fetcher(`${root}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error', signal,
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error('Scanner storage unavailable.'); }
      return boundedJson(response.body, 131072, signal);
    }, 5000);
  }
  const authenticate = (token: string): Promise<string | null> => deadline(async signal => {
    const response = await fetcher(`${root}/auth/v1/user`, { redirect: 'error', signal, headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
    if (response.status === 401 || response.status === 403) { void response.body?.cancel().catch(() => {}); return null; }
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error('Authentication unavailable.'); }
    const user = await boundedJson(response.body, 65536, signal);
    return isRecord(user) && isUserId(user.id) && user.role === 'authenticated'
      && (user.is_anonymous === true || (typeof user.email_confirmed_at === 'string' && Number.isFinite(Date.parse(user.email_confirmed_at)))) ? user.id : null;
  }, 5000);
  const store: HostedScannerStore = {
    status: async userId => outcome(await rpc('scanner_status', { p_user_id: userId })),
    claim: async (userId, requestId, digest) => {
      const value = await rpc('scanner_claim', { p_user_id: userId, p_request_id: requestId, p_digest: digest });
      return isRecord(value) && isUserId(value.lease) ? { lease: value.lease } : outcome(value);
    },
    complete: async (userId, requestId, lease, result) => {
      const value = await rpc('scanner_complete', { p_user_id: userId, p_request_id: requestId, p_lease: lease, p_status: result.status, p_body: result.body });
      if (!isRecord(value) || value.saved !== true) throw new Error('Scanner receipt pending.');
    },
  };
  return { authenticate, store };
}
