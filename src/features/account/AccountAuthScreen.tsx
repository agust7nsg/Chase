import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useAuth } from './AuthProvider';

export type AuthMode = 'create' | 'signin' | 'logout';
const titles: Record<AuthMode, string> = { create: 'Create Account', signin: 'Sign In', logout: 'Log Out' };
export function AccountAuthScreen({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const returnToProfile = () => router.dismissTo('/(tabs)/profile');
  const signInGoogle = async (existingAccount = false) => {
    if (auth.busy) return;
    setError(null); setNotice(null);
    try {
      const result = await auth.signInGoogle(existingAccount);
      if (result === 'success') returnToProfile();
      else if (result === 'cancel' || result === 'dismiss') setNotice('Google sign-in canceled. You can try again.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Google sign-in could not be completed.'); }
  };
  const signOut = async () => {
    if (auth.busy) return;
    setError(null);
    try { await auth.signOut(); returnToProfile(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.'); }
  };
  return <Screen safeTop={false}>
    <View style={{ paddingTop: 16, gap: 20 }}><Icon name={mode === 'logout' ? 'log-out-outline' : 'person-circle-outline'} color={colors.primary} size={32} /><Label kind="title" accessibilityRole="header">{titles[mode]}</Label></View>
    {mode !== 'logout' ? <View style={{ gap: 12 }}>
      <Button title="Continue with Apple" icon="logo-apple" variant="secondary" disabled={auth.busy}
        onPress={() => setNotice('Continue with Apple is not available yet.')} />
      <Button title="Continue with Google" icon="logo-google" variant="secondary" disabled={auth.busy || !auth.configured} loading={auth.googleInProgress}
        onPress={() => { void signInGoogle(); }} />
      {error?.includes('Use existing Google account') ? <Button title="Use existing Google account" variant="secondary" disabled={auth.busy}
        onPress={() => { void signInGoogle(true); }} /> : null}
      {notice ? <Label kind="caption" accessibilityLiveRegion="polite" style={uiStyles.muted}>{notice}</Label> : null}
      <Label kind="caption" style={uiStyles.muted}>Sign in to sync your account collection. Guest cards stay separate until you import them.</Label>
    </View> : auth.configured ? <View style={{ gap: 16 }}>
      <Label>{auth.user || auth.localAccountId ? `Sign out of ${auth.user?.email ?? 'your account'}?` : 'You are using Chase as a guest.'}</Label>
      <Label kind="caption" style={uiStyles.muted}>Your collection and pending scans stay on this device.</Label>
      {auth.user || auth.localAccountId ? <Button title="Log Out" loading={auth.busy} onPress={() => { void signOut(); }} /> : null}
    </View> : null}
    {!auth.configured ? <Label accessibilityRole="alert">Account connection is not configured yet. Guest mode and your saved cards are available.</Label> : null}
    {error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
    <Button title="Continue to Chase" variant="ghost" disabled={auth.busy} onPress={returnToProfile} />
  </Screen>;
}
