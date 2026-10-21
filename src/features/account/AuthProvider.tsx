import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { AccountService } from '@/services/auth/accountService';
import { accountError } from '@/services/auth/config';
import { supabase } from '@/services/auth/client';
import type { UserProfile } from '@/types/domain';

const service = supabase ? new AccountService(supabase) : null;
type AuthContextValue = {
  configured: boolean; ready: boolean; busy: boolean; user: UserProfile | null; scannerIdentity: string | null; error: string | null;
  retry: () => void; signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, redirect: string) => Promise<boolean>;
  signOut: () => Promise<void>; sendReset: (email: string, redirect: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>; completeRedirect: (code: string, flowId?: string) => Promise<boolean>;
};
const Context = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [scannerIdentity, setScannerIdentity] = useState<string | null>(null);
  const [ready, setReady] = useState(!service);
  const [busy, setBusy] = useState(false);
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
    return () => { mounted.current = false; invalidate(); subscription?.data.subscription.unsubscribe(); listener.remove(); updateActivity(false); };
  }, [refresh, invalidate]);
  const perform = async <T,>(operation: (account: AccountService) => Promise<T>): Promise<T> => {
    if (!service) throw new Error('Account connection is not configured.');
    if (working.current) throw new Error('Please wait for the current account request.');
    working.current = true; setBusy(true); setError(null);
    try { return await operation(service); }
    catch (cause) { throw new Error(accountError(cause)); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  return <Context.Provider value={{ configured: Boolean(service), ready, busy, user, scannerIdentity, error,
    retry: () => { void refresh(); },
    signIn: (email, password) => perform(async account => { await account.signIn(email, password); if (!await refresh()) throw new Error('Account could not be verified.'); }),
    signUp: (email, password, redirect) => perform(async account => { const confirm = await account.signUp(email, password, redirect); if (!confirm && !await refresh()) throw new Error('Account could not be verified.'); return confirm; }),
    signOut: () => perform(async account => { await account.signOut(); await refresh(); }),
    sendReset: (email, redirect) => perform(account => account.sendReset(email, redirect)),
    updatePassword: password => perform(account => account.updatePassword(password)),
    completeRedirect: (code, flowId) => perform(async account => { const recovery = await account.completeRedirect(code, flowId); if (!await refresh()) throw new Error('Account could not be verified.'); return recovery; }),
  }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider is missing.'); return value; }
