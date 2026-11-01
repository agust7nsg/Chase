import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { googleRedirectUri, type OAuthBrowser } from './oauth';

export const googleBrowser: OAuthBrowser = {
  redirectUri: () => googleRedirectUri(Platform.OS, Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined),
  async open(url, redirect) {
    if (Platform.OS === 'web') {
      // A full-page redirect avoids asynchronous popup blockers and works on mobile web.
      window.location.assign(url);
      return { type: 'redirecting' };
    }
    const result = await WebBrowser.openAuthSessionAsync(url, redirect);
    return result.type === 'success' ? { type: 'success', url: result.url } : { type: 'cancel' };
  },
};

export function dismissGoogleBrowser() {
  if (Platform.OS !== 'web') { try { WebBrowser.dismissAuthSession(); } catch { /* Already closed. */ } }
}
