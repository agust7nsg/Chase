/** Only authorization codes are accepted. Tokens and provider descriptions never reach UI/logs. */
export class OAuthError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Google sign-in could not be completed.');
    this.code = ['identity_already_exists', 'email_exists'].includes(code) ? 'google_identity_exists' : code;
  }
}

export function authCallbackParameters(params: Record<string, unknown>): { code: string; flowId?: string } {
  const failure = params.error_code || params.error;
  if (failure) throw new OAuthError(typeof failure === 'string' ? failure : 'invalid_oauth_callback');
  const { code, sb_flow_id: flowId } = params;
  if (typeof code !== 'string' || !/^[A-Za-z0-9._~-]{10,2048}$/.test(code)
    || (flowId !== undefined && (typeof flowId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)))) {
    throw new OAuthError('invalid_oauth_callback');
  }
  return { code, flowId: flowId as string | undefined };
}

export function googleRedirectUri(platform: string, expoGo: boolean, origin?: string): string {
  if (platform === 'web') {
    const url = new URL(origin!);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new OAuthError('invalid_oauth_callback');
    return `${url.origin}/auth/callback?provider=google`;
  }
  if (expoGo) throw new OAuthError('oauth_requires_build');
  return 'chase://auth/callback?provider=google';
}

export function parseGoogleCallback(actual: string, expected: string) {
  let received: URL; let target: URL;
  try { received = new URL(actual); target = new URL(expected); } catch { throw new OAuthError('invalid_oauth_callback'); }
  if (received.protocol !== target.protocol || received.host !== target.host || received.pathname !== target.pathname
    || received.username || received.password || received.searchParams.get('provider') !== 'google') throw new OAuthError('invalid_oauth_callback');
  const hash = new URLSearchParams(received.hash.slice(1));
  if (hash.has('access_token') || hash.has('refresh_token')) throw new OAuthError('invalid_oauth_callback');
  return authCallbackParameters({ code: received.searchParams.get('code') ?? undefined,
    sb_flow_id: received.searchParams.get('sb_flow_id') ?? undefined,
    error_code: received.searchParams.get('error_code') || hash.get('error_code'),
    error: received.searchParams.get('error') || hash.get('error') });
}

export type OAuthBrowserResult = { type: 'success'; url: string } | { type: 'cancel' | 'dismiss' | 'redirecting' };
export interface GoogleOAuthAccount {
  startGoogle(redirectTo: string, existingAccount?: boolean): Promise<{ url: string; flowId?: string }>;
  completeRedirect(code: string, flowId?: string): Promise<boolean>;
}
export interface OAuthBrowser { redirectUri(): string; open(url: string, redirect: string): Promise<OAuthBrowserResult> }

/** Browser transport is injected: deterministic tests never contact Google or create accounts. */
export async function runGoogleOAuth(account: GoogleOAuthAccount, browser: OAuthBrowser, existingAccount = false) {
  const redirect = browser.redirectUri(); // Fail before modifying any PKCE state in unsupported runtimes.
  const started = await account.startGoogle(redirect, existingAccount);
  const result = await browser.open(started.url, redirect);
  if (result.type !== 'success') return result.type;
  const { code, flowId } = parseGoogleCallback(result.url, redirect);
  await account.completeRedirect(code, flowId ?? started.flowId);
  return 'success' as const;
}
