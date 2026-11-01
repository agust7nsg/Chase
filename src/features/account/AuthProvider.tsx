import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { AccountService } from '@/services/auth/accountService';
import { accountError } from '@/services/auth/config';
import { supabase, supabaseConfig, accountPrivateStorage, rememberedLocalOwner, rememberLocalOwner } from '@/services/auth/client';
import type { UserProfile } from '@/types/domain';
import { runGoogleOAuth } from '@/services/auth/oauth';
import { dismissGoogleBrowser, googleBrowser } from '@/services/auth/oauthBrowser';

import { AccountDeletion, deletionDeadline, submitAccountDeletion, type DeletionJob } from '@/services/auth/deletion';

const service = supabase ? new AccountService(supabase) : null;
type AuthContextValue = {
  deletionJob: DeletionJob | null; deletionReady: boolean; deleteAccount: (owner: string) => Promise<void>; finishDeletion: (owner: string) => Promise<void>;
  localAccountId: string | null; localReady: boolean; configured: boolean; ready: boolean; busy: boolean; googleInProgress: boolean; user: UserProfile | null; scannerIdentity: string | null; error: string | null;
  signInGoogle: (existingAccount?: boolean) => Promise<'success' | 'cancel' | 'dismiss' | 'redirecting'>;
  retry: () => void; signOut: () => Promise<void>;
  completeRedirect: (code: string, flowId?: string) => Promise<void>;
};
const Context = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [, deletionUpdate] = useState(0);
  const [deletion] = useState(() => new AccountDeletion(accountPrivateStorage, `chase.auth.${supabaseConfig?.project ?? 'unconfigured'}.deletion.v1`, () => deletionUpdate(n => n + 1)));
  const [deletionReady, setDeletionReady] = useState(false);
  const deletionLoad = useRef<Promise<void> | null>(null);
  const loadDeletion = useCallback(() => {
    if (!deletionLoad.current) deletionLoad.current = deletion.load().then(() => setDeletionReady(true));
    return deletionLoad.current;
  }, [deletion]);
  const [localReady, setLocalReady] = useState(!service);
  const [localAccountId, setLocalAccountId] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [scannerIdentity, setScannerIdentity] = useState<string | null>(null);
  const [ready, setReady] = useState(!service);
  const [busy, setBusy] = useState(false);
  const [googleInProgress, setGoogleInProgress] = useState(false);
  const googleActive = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true); const generation = useRef(0); const working = useRef(false);
  const invalidate = useCallback(() => ++generation.current, []);
  const refresh = useCallback(async () => {
    const version = invalidate();
    await loadDeletion();
    if (!service) { setLocalReady(true); return null; }
    let sessionLoaded = false;
    try {
      // This ID selects only an offline local replica. It never authorizes cloud access.
      let sessionTimer: ReturnType<typeof setTimeout> | undefined;
      const stored = await Promise.race([
        service.client.auth.getSession(),
        new Promise<never>((_, reject) => { sessionTimer = setTimeout(() => reject(new Error('Local session refresh is pending.')), 1500); }),
      ]).finally(() => { if (sessionTimer) clearTimeout(sessionTimer); });
      if (stored.error) throw stored.error;
      sessionLoaded = true;
      const cached = stored.data.session?.user;
      const deletedOwner = deletion.job?.status === 'confirmed' ? deletion.job.ownerId : null;
      const cachedOwner = cached && !cached.is_anonymous && cached.id !== deletedOwner && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(cached.id) ? cached.id : null;
      if (mounted.current && version === generation.current) setLocalAccountId(cachedOwner);
      if (mounted.current && version === generation.current) setLocalReady(true);
      if (version === generation.current) await rememberLocalOwner(cachedOwner);
      const fetchedIdentity = await service.identity();
      const identity = fetchedIdentity?.id === (deletion.job?.status === 'confirmed' ? deletion.job.ownerId : null) ? null : fetchedIdentity;
      if (mounted.current && version === generation.current) { setUser(identity?.profile ?? null); setLocalAccountId(identity?.profile ? identity.id : null); setScannerIdentity(identity?.id ?? null); setError(null); }
      if (version === generation.current && (identity?.profile ? identity.id : null) !== cachedOwner) await rememberLocalOwner(identity?.profile ? identity.id : null);
      return identity?.profile ?? null;
    } catch (cause) {
      // Expired tokens can fail to refresh offline. Keep the last local replica
      // available without presenting it as a verified login or uploading it.
      if (!sessionLoaded) { const cached = await rememberedLocalOwner(); if (mounted.current && version === generation.current) setLocalAccountId(cached === (deletion.job?.status === 'confirmed' ? deletion.job.ownerId : null) ? null : cached); }
      if (mounted.current && version === generation.current) { setUser(null); setScannerIdentity(null); setError(accountError(cause)); }
      return null;
    } finally { if (mounted.current && version === generation.current) { setReady(true); setLocalReady(true); } }
  }, [invalidate, loadDeletion, deletion]);
  useEffect(() => {
    mounted.current = true;
    const subscription = supabase?.auth.onAuthStateChange(event => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') { invalidate(); void rememberLocalOwner(null); setUser(null); setLocalAccountId(null); setLocalReady(true); setScannerIdentity(null); setError(null); setReady(true); }
      // Never await another Supabase auth method inside its locked event callback.
      else void Promise.resolve().then(refresh).catch(() => { setError('Account deletion recovery could not be loaded. Restart the app to protect your data.'); });
    });
    void Promise.resolve().then(refresh).catch(() => { setError('Account deletion recovery could not be loaded. Restart the app to protect your data.'); });
    const updateActivity = (active: boolean) => {
      if (Platform.OS !== 'web' && supabase) {
        if (active) void supabase.auth.startAutoRefresh(); else void supabase.auth.stopAutoRefresh();
      }
    };
    updateActivity(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => updateActivity(state === 'active'));
    return () => { mounted.current = false; invalidate(); subscription?.data.subscription.unsubscribe(); listener.remove(); updateActivity(false); if (googleActive.current) dismissGoogleBrowser(); };
  }, [refresh, invalidate]);
  const perform = async <T,>(operation: (account: AccountService) => Promise<T>): Promise<T> => {
    if (!service) throw new Error('Account connection is not configured.');
    if (working.current) throw new Error('Please wait for the current account request.');
    working.current = true; setBusy(true); setError(null);
    try { return await operation(service); }
    catch (cause) { throw new Error(accountError(cause)); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  return <Context.Provider value={{ deletionJob: deletion.job, deletionReady,
    deleteAccount: async owner => {
      await loadDeletion();
      const config = supabaseConfig;
      if (!service || !config) throw new Error('Account connection is unavailable.');
      if (!deletion.job && user?.id !== owner) throw new Error('Sign in to the account before deleting it.');
      await deletion.run(owner, () => ({ ownerId: owner, operationId: Crypto.randomUUID(), proof: [...Crypto.getRandomBytes(32)].map(byte => byte.toString(16).padStart(2, '0')).join(''), status: 'pending' }), async job => {
        let token: string | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const session = await Promise.race([service.client.auth.getSession(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Session unavailable.')), 1500); })]);
          if (session.data.session?.user.id === job.ownerId) token = session.data.session.access_token;
        } catch { /* An authorized receipt can recover without the deleted session. */ }
        finally { if (timer) clearTimeout(timer); }
        await submitAccountDeletion(config, job, token);
      });
    },
    finishDeletion: owner => perform(async account => {
      if (deletion.job?.ownerId !== owner || deletion.job.status !== 'confirmed') throw new Error('Deletion is not confirmed.');
      // Never sign out a different account that was selected while recovery was pending.
      const stored = await deletionDeadline(account.client.auth.getSession());
      if (stored?.error) throw stored.error;
      if (stored?.data.session?.user.id === owner) { await deletionDeadline(account.signOut(), 20000); }
      if (await rememberedLocalOwner() === owner) await rememberLocalOwner(null);
      invalidate();
      setLocalAccountId(current => current === owner ? null : current);
      setUser(current => current?.id === owner ? null : current);
      setScannerIdentity(current => current === owner ? null : current);
      await deletion.finish();
    }), localAccountId, localReady, configured: Boolean(service), ready, busy, googleInProgress, user, scannerIdentity, error,
    retry: () => { if (!deletionReady) deletionLoad.current = null; void refresh().catch(() => setError('Account deletion recovery could not be loaded. Restart the app to protect your data.')); },
    signInGoogle: (existingAccount = false) => perform(async account => {
      googleActive.current = true; setGoogleInProgress(true);
      try {
        const result = await runGoogleOAuth(account, googleBrowser, existingAccount);
        if (result === 'success' && !await refresh()) throw new Error('Account could not be verified.');
        return result;
      } finally { googleActive.current = false; if (mounted.current) setGoogleInProgress(false); }
    }),
    signOut: () => perform(async account => { await account.signOut(); await refresh(); }),
    completeRedirect: (code, flowId) => perform(async account => { await account.completeRedirect(code, flowId); if (!await refresh()) throw new Error('Account could not be verified.'); }),
  }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider is missing.'); return value; }
