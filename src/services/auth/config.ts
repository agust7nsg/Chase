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

export function validateCredentials(email: string, password: string, create = false): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) return 'Enter a valid email address.';
  if (!password || (create && password.length < 8)) return create ? 'Use a password with at least 8 characters.' : 'Enter your password.';
  if (password.length > 1024) return 'This password is too long.';
  return null;
}

/** Do not display arbitrary upstream messages, URLs, tokens or provider internals. */
export function accountError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  const message = error instanceof Error ? error.message : '';
  // Older Auth responses may lack a versioned error code. Match only known text.
  if (message === 'Invalid login credentials') return 'Email or password is incorrect.';
  if (message === 'Email not confirmed') return 'Confirm your email before signing in.';
  if (code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (code === 'email_not_confirmed') return 'Confirm your email before signing in.';
  if (code === 'weak_password') return 'Choose a stronger password.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Too many attempts. Please try again later.';
  if (code === 'signup_disabled') return 'Account registration is currently unavailable.';
  if (code === 'otp_expired' || code === 'flow_state_not_found' || code === 'bad_code_verifier') return 'This email link has expired or belongs to another device. Request a new link on this device.';
  return 'Could not connect to your account. Check your connection and try again.';
}
