import 'react-native-url-polyfill/auto';
import './nativeCrypto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { parseSupabaseConfig } from './config';
import { ChunkedAuthStorage, type SecureKeyValue } from './secureStorage';
import { accountFetch } from './fetch';

export const supabaseConfig = parseSupabaseConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const nativeStorage = new ChunkedAuthStorage({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
});
const browserStorage: SecureKeyValue = {
  getItem: async key => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: async (key, value) => { if (typeof window === 'undefined') throw new Error('Browser storage unavailable.'); window.localStorage.setItem(key, value); },
  removeItem: async key => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};
const localOwnerKey = `chase.auth.${supabaseConfig?.project ?? 'unconfigured'}.local-owner`;
export const accountPrivateStorage = Platform.OS === 'web' ? browserStorage : nativeStorage;
const authStorage = accountPrivateStorage;
/** A cache selector only; this value must never authorize a cloud request. */
export async function rememberedLocalOwner(): Promise<string | null> {
  try { const id = await authStorage.getItem(localOwnerKey); return id && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id) ? id : null; } catch { return null; }
}
export async function rememberLocalOwner(id: string | null): Promise<void> {
  try { if (id) await authStorage.setItem(localOwnerKey, id); else await authStorage.removeItem(localOwnerKey); } catch { /* Session storage failures are reported by the Auth SDK; this is only a cache hint. */ }
}
export const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  global: { fetch: accountFetch() },
  auth: { storage: authStorage,
    storageKey: `chase.auth.${supabaseConfig.project}.v1`, persistSession: true,
    autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
}) : null;
