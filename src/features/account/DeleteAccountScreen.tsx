import { useState } from 'react';
import { router } from 'expo-router';
import { TextInput, View } from 'react-native';
import { Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import { deletionMessage } from '@/services/auth/deletion';
import { useAuth } from './AuthProvider';

export function DeleteAccountScreen() {
  const auth = useAuth(); const chase = useChase();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Capture the reviewed identity; an account change never changes who this confirmation deletes.
  const [reviewedOwner] = useState(auth.deletionJob?.ownerId ?? auth.user?.id ?? null);
  const job = auth.deletionJob;
  const eligible = reviewedOwner !== null && auth.user?.id === reviewedOwner;
  const confirmed = job?.status === 'confirmed';
  const remove = async () => {
    if (busy || !reviewedOwner || (!job && (!eligible || confirmation !== 'DELETE'))) return;
    setBusy(true); setError(null);
    let serverConfirmed = confirmed;
    try {
      if (!confirmed) { await auth.deleteAccount(reviewedOwner); serverConfirmed = true; }
      await chase.forgetDeletedAccount(reviewedOwner);
      await auth.finishDeletion(reviewedOwner);
      setDone(true);
    } catch (cause) { setError(serverConfirmed ? 'Your account was deleted. Local cleanup could not finish. Retry on this device.' : deletionMessage(cause)); }
    finally { setBusy(false); }
  };
  return <Screen safeTop={false}>
    <View style={{ gap: 20, paddingTop: 16 }}>
      <Icon name={done ? 'checkmark-circle-outline' : 'trash-outline'} color={done ? colors.success : colors.danger} size={32} />
      <Label kind="title" accessibilityRole="header">{done ? 'Account deleted' : 'Delete Account'}</Label>
    </View>
    {done ? <Label>Your Chase account and cloud collection were deleted. Your guest cards and Organize are still on this device.</Label>
      : <View style={{ gap: 16 }}>
        {job ? <>
          <Label kind="heading">{confirmed ? 'Finish local cleanup' : 'Check your deletion request'}</Label>
          <Label style={uiStyles.muted}>{confirmed ? 'Your account was deleted. Finish removing its cached collection from this device.' : 'A deletion request was submitted. Retry to confirm the result. Sync for this account is paused.'}</Label>
          <Button title={confirmed ? 'Finish cleanup' : 'Check or retry deletion'} loading={busy} disabled={auth.busy} onPress={() => { void remove(); }} />
        </> : eligible ? <>
          <Label kind="heading">Permanently delete your account?</Label>
          <Label>{auth.user?.email ?? auth.user?.displayName}</Label>
          <Label style={uiStyles.muted}>This deletes your Chase account, synced collection, and account scan records. Its cached collection on this device is also removed. This cannot be undone.</Label>
          <Label style={uiStyles.muted}>Guest cards and pending cards in Organize stay on this device. Your Google account is not deleted.</Label>
          <Label>Type DELETE to confirm</Label>
          <TextInput accessibilityLabel="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} editable={!busy}
            style={{ minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, fontSize: 16, color: colors.text, backgroundColor: colors.surface }} />
          <Button title="Permanently delete account" variant="danger" loading={busy} disabled={auth.busy || confirmation !== 'DELETE'} onPress={() => { void remove(); }} />
        </> : <Label>{reviewedOwner ? 'The account changed or needs to be verified. Sign in, then reopen Delete Account from Profile.' : 'You are using Chase as a guest. There is no registered account to delete.'}</Label>}
        {error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
        {(!eligible || error?.includes('Sign in again')) && !confirmed ? <Button title="Sign in again with Google" icon="logo-google" variant="secondary" disabled={busy} onPress={() => router.push({ pathname: '/account', params: { section: 'signin' } })} /> : null}
      </View>}
    <Button title={done || job ? 'Continue to Chase' : 'Cancel'} variant="ghost" disabled={busy} onPress={() => router.dismissTo('/(tabs)/profile')} />
  </Screen>;
}
