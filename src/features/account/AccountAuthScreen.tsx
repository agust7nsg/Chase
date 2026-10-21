import { useState } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { validateCredentials } from '@/services/auth/config';
import { useAuth } from './AuthProvider';

export type AuthMode = 'create' | 'signin' | 'forgot' | 'reset' | 'logout';
const titles: Record<AuthMode, string> = { create: 'Create Account', signin: 'Sign In', forgot: 'Reset password', reset: 'New password', logout: 'Log Out' };
export function AccountAuthScreen({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const navigate = (section: AuthMode) => router.replace({ pathname: '/account', params: { section } });
  const returnToProfile = () => router.dismissTo('/(tabs)/profile');
  const submit = async () => {
    if (auth.busy) return;
    const invalid = mode === 'reset' ? validateCredentials('valid@example.com', password, true)
      : mode === 'logout' ? null : validateCredentials(email, mode === 'forgot' ? 'valid' : password, mode === 'create');
    setError(invalid); setNotice(null); if (invalid) return;
    try {
      if (mode === 'signin') { await auth.signIn(email, password); setPassword(''); returnToProfile(); }
      else if (mode === 'create') {
        const confirm = await auth.signUp(email, password, Linking.createURL('/auth/callback'));
        setPassword(''); if (confirm) setNotice('Check your email to confirm your account, then sign in.'); else returnToProfile();
      } else if (mode === 'forgot') { await auth.sendReset(email, Linking.createURL('/auth/callback')); setNotice('If an account exists for this email, you will receive a reset link. Open it on this device.'); }
      else if (mode === 'reset') { await auth.updatePassword(password); setPassword(''); setNotice('Password updated.'); }
      else { await auth.signOut(); returnToProfile(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Account request failed. Please try again.'); }
  };
  const showEmail = mode === 'signin' || mode === 'create' || mode === 'forgot';
  const showPassword = mode === 'signin' || mode === 'create' || mode === 'reset';
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen safeTop={false}>
      <View style={{ paddingTop: 16, gap: 20 }}><Icon name={mode === 'logout' ? 'log-out-outline' : 'person-circle-outline'} color={colors.primary} size={32} /><Label kind="title" accessibilityRole="header">{titles[mode]}</Label></View>
      {!auth.configured ? <Label accessibilityRole="alert">Account connection is not configured yet. Guest mode and your saved cards are available.</Label>
        : mode === 'logout' ? <View style={{ gap: 16 }}><Label>{auth.user ? `Sign out of ${auth.user.email ?? 'your account'}?` : 'You are using Chase as a guest.'}</Label><Label kind="caption" style={uiStyles.muted}>Your collection and pending scans stay on this device.</Label>{auth.user ? <Button title="Log Out" loading={auth.busy} onPress={() => { void submit(); }} /> : null}</View>
        : mode === 'reset' && !auth.user ? <View style={{ gap: 16 }}><Label>Open a password reset link on this device first.</Label><Button title="Request reset link" onPress={() => navigate('forgot')} /></View>
        : <View style={{ gap: 20 }}>
          {notice ? <Label accessibilityLiveRegion="polite" style={{ color: colors.success }}>{notice}</Label> : null}
          {showEmail ? <View style={{ gap: 8 }}><Label nativeID="account-email-label">Email</Label><TextInput accessibilityLabel="Email" accessibilityLabelledBy="account-email-label" value={email} onChangeText={setEmail} editable={!auth.busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" style={uiStyles.input} /></View> : null}
          {showPassword ? <View style={{ gap: 8 }}><Label nativeID="account-password-label">Password</Label><TextInput accessibilityLabel="Password" accessibilityLabelledBy="account-password-label" value={password} onChangeText={setPassword} editable={!auth.busy} secureTextEntry={!visiblePassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} textContentType={mode === 'signin' ? 'password' : 'newPassword'} style={uiStyles.input} /><Button variant="ghost" title={visiblePassword ? 'Hide password' : 'Show password'} onPress={() => setVisiblePassword(value => !value)} />{mode !== 'signin' ? <Label kind="caption" style={uiStyles.muted}>At least 8 characters.</Label> : null}</View> : null}
          {error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
          <Button title={mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : titles[mode]} loading={auth.busy} onPress={() => { void submit(); }} />
          {mode === 'signin' ? <><Button variant="ghost" title="Forgot password?" onPress={() => navigate('forgot')} /><Button variant="ghost" title="Create Account" onPress={() => navigate('create')} /></> : mode === 'create' ? <Button variant="ghost" title="Sign In" onPress={() => navigate('signin')} /> : notice && mode === 'reset' ? <Button title="Return to Profile" onPress={returnToProfile} /> : null}
          <Label kind="caption" style={uiStyles.muted}>Your collection stays on this device. Cloud backup is not connected yet.</Label>
        </View>}
      {mode === 'logout' && error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
      <Button title="Continue to Chase" variant="ghost" onPress={returnToProfile} />
    </Screen>
  </KeyboardAvoidingView>;
}
