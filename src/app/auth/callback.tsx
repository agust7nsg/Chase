import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Button, Label, Screen } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/features/account/AuthProvider';
import { authCallbackParameters } from '@/services/auth/oauth';
import { accountError } from '@/services/auth/config';

export default function AuthCallbackScreen() {
  const { code, error_code, error: providerError, sb_flow_id, provider, '#': fragment } = useLocalSearchParams<{ code?: string; error_code?: string; error?: string; sb_flow_id?: string; provider?: string; '#'?: string }>();
  const auth = useAuth(); const started = useRef(false); const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => {
    try {
      // Supabase can return OAuth errors in the URL fragment. Never display its description.
      const hash = typeof fragment === 'string' ? new URLSearchParams(fragment) : null;
      return { value: authCallbackParameters({ code, sb_flow_id, error_code: error_code || hash?.get('error_code'), error: providerError || hash?.get('error') }), error: null };
    } catch (cause) { return { value: null, error: accountError(cause) }; }
  }, [code, sb_flow_id, error_code, providerError, fragment]);
  const invalid = !auth.configured ? 'Account connection is not configured.' : parsed.error;
  useEffect(() => {
    // Native Linking and openAuthSession can receive the same URL. Let the active
    // browser operation finish first; cold launches/web use this route directly.
    if (started.current || invalid || !parsed.value || auth.googleInProgress) return; started.current = true;
    void auth.completeRedirect(parsed.value.code, parsed.value.flowId).then(recovery => { if (recovery && provider !== 'google') router.replace({ pathname: '/account', params: { section: 'reset' } }); else router.dismissTo('/(tabs)/profile'); })
      .catch(() => setError('This sign-in link has expired or could not be verified. Try again on this device.'));
  }, [auth, invalid, parsed, provider]);
  const message = error ?? invalid;
  return <Screen><Label kind="title">Verify account</Label>{message ? <>
    <Label accessibilityRole="alert">{message}</Label>
    {message.includes('Use existing Google account') ? <Button title="Use existing Google account" loading={auth.googleInProgress} disabled={auth.busy} onPress={() => {
      void auth.signInGoogle(true).then(result => { if (result === 'success') router.dismissTo('/(tabs)/profile'); }).catch(() => setError('Google sign-in could not be completed. Return to Sign In and try again.'));
    }} /> : null}
    <Button title="Sign In" disabled={auth.busy} onPress={() => router.replace({ pathname: '/account', params: { section: 'signin' } })} />
    <Button title="Continue to Chase" variant="ghost" disabled={auth.busy} onPress={() => router.dismissTo('/(tabs)/profile')} />
  </> : <><ActivityIndicator color={colors.primary} /><Label>Verifying your account…</Label></>}</Screen>;
}
