import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { AccountService } from '@/services/auth/accountService';
import { accountError } from '@/services/auth/config';
import { supabase } from '@/services/auth/client';
import type { UserProfile } from '@/types/domain';
import { runGoogleOAuth } from '@/services/auth/oauth';
import { dismissGoogleBrowser, googleBrowser } from '@/services/auth/oauthBrowser';

const service = supabase ? new AccountService(supabase) : null;
type AuthContextValue = {
  configured: boolean; ready: boolean; busy: boolean; googleInProgress: boolean; user: UserProfile | null; scannerIdentity: string | null; error: string | null;
  signInGoogle: (existingAccount?: boolean) => Promise<'success' | 'cancel' | 'dismiss' | 'redirecting'>;
  retry: () => void; signOut: () => Promise<void>;
  completeRedirect: (code: string, flowId?: string) => Promise<void>;
};
const Context = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
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
    if (!service) return null;
    try {
      const identity = await service.identity();
      if (mounted.current && version === generation.current) { setUser(identity?.profile ?? null); setScannerIdentity(identity?.id ?? null); setError(null); }
      return identity?.profile ?? null;
    } catch (cause) {
      if (mounted.current && version === generation.current) { setUser(null); setScannerIdentity(null); setError(accountError(cause)); }
      return null;
    } finally { if (mounted.current && version === generation.current) setReady(true); }
  }, [invalidate]);
  useEffect(() => {
    mounted.current = true;
    const subscription = supabase?.auth.onAuthStateChange(event => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') { invalidate(); setUser(null); setScannerIdentity(null); setError(null); setReady(true); }
      // Never await another Supabase auth method inside its locked event callback.
      else void Promise.resolve().then(refresh);
    });
    void Promise.resolve().then(refresh);
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
  return <Context.Provider value={{ configured: Boolean(service), ready, busy, googleInProgress, user, scannerIdentity, error,
    retry: () => { void refresh(); },
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
