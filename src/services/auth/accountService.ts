import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { UserProfile } from '../../types/domain';
import { validateCredentials } from './config';
import type { AccountAuthenticationService } from '../contracts';
import { OAuthError } from './oauth';

export function profileFor(user: User): UserProfile {
  const rawName = user.user_metadata?.display_name ?? user.user_metadata?.full_name;
  const name = typeof rawName === 'string' ? rawName.trim().slice(0, 80) : '';
  return { id: user.id, email: user.email, displayName: name || user.email?.split('@')[0] || 'Collector' };
}

/** Auth only: these operations never read/upload collection or pending scans. */
export class AccountService implements AccountAuthenticationService {
  private exchange: { code: string; flowId?: string; request: Promise<boolean> } | null = null;
  constructor(readonly client: SupabaseClient) {}
  async current(): Promise<UserProfile | null> {
    return (await this.identity())?.profile ?? null;
  }
  async identity(): Promise<{ id: string; profile: UserProfile | null } | null> {
    const stored = await this.client.auth.getSession();
    if (stored.error) throw stored.error;
    if (!stored.data.session) return null;
    // Cached JWT/user metadata alone is not proof of a valid server session.
    const result = await this.client.auth.getUser();
    if (result.error) throw result.error;
    const user = result.data.user;
    return user ? { id: user.id, profile: user.is_anonymous ? null : profileFor(user) } : null;
  }
  async signIn(email: string, password: string) {
    const invalid = validateCredentials(email, password); if (invalid) throw new Error(invalid);
    const result = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) throw result.error;
  }
  async startGoogle(redirectTo: string, existingAccount = false): Promise<{ url: string; flowId?: string }> {
    const stored = await this.client.auth.getSession();
    if (stored.error) throw stored.error;
    const credentials = { provider: 'google' as const, options: { redirectTo, skipBrowserRedirect: true,
      scopes: 'openid email profile', queryParams: { prompt: 'select_account' } } };
    // Upgrade scanner guests in place; ordinary sign-in to an existing Google account is an explicit alternative.
    const result = stored.data.session?.user.is_anonymous && !existingAccount
      ? await this.client.auth.linkIdentity(credentials) : await this.client.auth.signInWithOAuth(credentials);
    if (result.error) throw new OAuthError(result.error.code ?? 'google_unavailable');
    if (!result.data.url) throw new OAuthError('invalid_oauth_callback');
    const target = new URL(result.data.url);
    if (target.protocol !== 'https:' || target.username || target.password) throw new OAuthError('invalid_oauth_callback');
    return { url: target.href, flowId: result.data.flowId ?? undefined };
  }
  async signUp(email: string, password: string, redirectTo: string): Promise<boolean> {
    const stored = await this.client.auth.getSession();
    if (stored.error) throw stored.error;
    const guest = stored.data.session?.user.is_anonymous === true;
    const invalid = validateCredentials(email, guest ? 'guest-upgrade' : password, true); if (invalid) throw new Error(invalid);
    // Link guest registration in place: same server quota and local ownership.
    if (guest) {
      // Supabase requires email verification BEFORE an anonymous user can set
      // a password. This UI-only marker routes the verified callback to setup.
      const result = await this.client.auth.updateUser({ email: email.trim(), data: { chase_password_setup: true } }, { emailRedirectTo: redirectTo });
      if (result.error) throw result.error;
      return true;
    }
    const result = await this.client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
    if (result.error) throw result.error;
    return !result.data.session;
  }
  async signOut() { const result = await this.client.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }
  async sendReset(email: string, redirectTo: string) {
    if (validateCredentials(email, 'valid')) throw new Error('Enter a valid email address.');
    const result = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo }); if (result.error) throw result.error;
  }
  async updatePassword(password: string) {
    if (validateCredentials('valid@example.com', password, true)) throw new Error('Use a password with at least 8 characters.');
    const result = await this.client.auth.updateUser({ password, data: { chase_password_setup: false } }); if (result.error) throw result.error;
  }
  completeRedirect(code: string, flowId?: string): Promise<boolean> {
    if (!/^[A-Za-z0-9._~-]{10,2048}$/.test(code)) return Promise.reject(new Error('Invalid email link.'));
    if (flowId !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)) return Promise.reject(new Error('Invalid email link.'));
    if (this.exchange?.code === code) {
      // Native browser knows the initiating flow; Router may receive the same
      // code without the optional flow selector. Never exchange it twice.
      if (flowId && this.exchange.flowId && flowId !== this.exchange.flowId) return Promise.reject(new Error('Invalid sign-in link.'));
      return this.exchange.request;
    }
    const request = this.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined).then(result => {
      if (result.error) throw result.error;
      return ('redirectType' in result.data && result.data.redirectType === 'recovery')
        || result.data.user?.user_metadata?.chase_password_setup === true;
    });
    this.exchange = { code, flowId, request }; return request;
  }
}
