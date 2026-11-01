import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { UserProfile } from '../../types/domain';
import type { AccountAuthenticationService } from '../contracts';
import { OAuthError } from './oauth';

export function profileFor(user: User): UserProfile {
  const rawName = user.user_metadata?.display_name ?? user.user_metadata?.full_name;
  const name = typeof rawName === 'string' ? rawName.trim().slice(0, 80) : '';
  return { id: user.id, email: user.email, displayName: name || user.email?.split('@')[0] || 'Collector' };
}

/** Auth only: these operations never read/upload collection or pending scans. */
export class AccountService implements AccountAuthenticationService {
  private exchange: { code: string; flowId?: string; request: Promise<void> } | null = null;
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
  async signOut() { const result = await this.client.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }
  completeRedirect(code: string, flowId?: string): Promise<void> {
    if (!/^[A-Za-z0-9._~-]{10,2048}$/.test(code)) return Promise.reject(new Error('Invalid sign-in link.'));
    if (flowId !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)) return Promise.reject(new Error('Invalid sign-in link.'));
    if (this.exchange?.code === code) {
      // Native browser knows the initiating flow; Router may receive the same
      // code without the optional flow selector. Never exchange it twice.
      if (flowId && this.exchange.flowId && flowId !== this.exchange.flowId) return Promise.reject(new Error('Invalid sign-in link.'));
      return this.exchange.request;
    }
    const request = this.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined).then(result => {
      if (result.error) throw result.error;
    });
    this.exchange = { code, flowId, request }; return request;
  }
}
