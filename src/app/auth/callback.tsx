import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Button, Label, Screen } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/features/account/AuthProvider';

export default function AuthCallbackScreen() {
  const { code, error_code, sb_flow_id } = useLocalSearchParams<{ code?: string; error_code?: string; sb_flow_id?: string }>();
  const auth = useAuth(); const started = useRef(false); const [error, setError] = useState<string | null>(null);
  const invalid = error_code || !code || !auth.configured ? 'This email link cannot be opened. Request a new link on this device.' : null;
  useEffect(() => {
    if (started.current || invalid || !code) return; started.current = true;
    void auth.completeRedirect(code, sb_flow_id).then(recovery => { if (recovery) router.replace({ pathname: '/account', params: { section: 'reset' } }); else router.dismissTo('/(tabs)/profile'); })
      .catch(() => setError('This link has expired or could not be verified. Request a new link on this device.'));
  }, [auth, code, invalid, sb_flow_id]);
  return <Screen><Label kind="title">Verify account</Label>{error || invalid ? <><Label accessibilityRole="alert">{error ?? invalid}</Label><Button title="Sign In" onPress={() => router.replace({ pathname: '/account', params: { section: 'signin' } })} /></> : <><ActivityIndicator color={colors.primary} /><Label>Verifying your email link…</Label></>}</Screen>;
}
