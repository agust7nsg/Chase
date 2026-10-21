import type { Session, SupabaseClient } from '@supabase/supabase-js';

/** Reuse the persisted identity. Only the explicit scanner entry creates a guest. */
export function createScannerSession(client: SupabaseClient): () => Promise<Session> {
  let pending: Promise<Session> | null = null;
  return () => {
    if (pending) return pending;
    pending = (async () => {
      const stored = await client.auth.getSession();
      if (stored.error) throw stored.error;
      if (stored.data.session) return stored.data.session;
      const result = await client.auth.signInAnonymously();
      if (result.error || !result.data.session) {
        throw new Error(result.error?.code === 'anonymous_provider_disabled'
          ? 'Guest scanning is not enabled on the server yet.'
          : 'Could not connect guest scanning. Please try again.');
      }
      return result.data.session;
    })().finally(() => { pending = null; });
    return pending;
  };
}
