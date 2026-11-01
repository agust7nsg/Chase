export interface SupabaseConfig { url: string; publishableKey: string; project: string }

export function parseSupabaseConfig(url?: string, key?: string): SupabaseConfig | null {
  if (!url?.trim() || !key?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
      || !/^([a-z0-9]{20})\.supabase\.co$/.test(parsed.hostname) || !['', '/'].includes(parsed.pathname)
      || parsed.port || !/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(key.trim())) return null;
    return { url: parsed.origin, publishableKey: key.trim(), project: parsed.hostname.split('.')[0] };
  } catch { return null; }
}

/** Do not display arbitrary upstream messages, URLs, tokens or provider internals. */
export function accountError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'oauth_requires_build') return 'Google sign-in needs an installed Chase build. Expo Go does not support this OAuth callback. You can continue as a guest.';
  if (code === 'access_denied') return 'Google sign-in was canceled. You can try again or continue as a guest.';
  if (code === 'provider_disabled' || code === 'validation_failed' || code === 'oauth_provider_not_supported') return 'Google sign-in is not enabled correctly in Supabase yet. You can continue as a guest.';
  if (code === 'manual_linking_disabled') return 'Google account linking is not enabled in Supabase yet. Your guest session and saved cards are unchanged.';
  if (code === 'unsupported_auth_link') return 'This sign-in link is no longer supported. Continue with Google or as a guest.';
  if (code === 'invalid_oauth_callback') return 'Google sign-in could not be verified. Return to Sign In and try again on this device.';
  if (code === 'google_identity_exists') return 'This Google account already belongs to a Chase account. Choose Use existing Google account to sign in. Your local cards will stay on this device.';
  if (code === 'over_request_rate_limit') return 'Too many attempts. Please try again later.';
  if (code === 'signup_disabled') return 'Account registration is currently unavailable.';
  if (code === 'otp_expired' || code === 'flow_state_not_found' || code === 'bad_code_verifier') return 'Google sign-in has expired or belongs to another device. Try signing in again on this device.';
  return 'Could not connect to your account. Check your connection and try again.';
}
