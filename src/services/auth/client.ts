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
export const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  global: { fetch: accountFetch() },
  auth: { storage: Platform.OS === 'web' ? browserStorage : nativeStorage,
    storageKey: `chase.auth.${supabaseConfig.project}.v1`, persistSession: true,
    autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
}) : null;
