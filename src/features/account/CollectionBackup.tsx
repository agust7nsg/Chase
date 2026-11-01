import { useState } from 'react';
import { View } from 'react-native';
import { Button, Label, Section, uiStyles } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { getCatalogCard } from '@/data/mocks/catalog';
import { colors } from '@/theme/tokens';

export function CollectionBackup() {
  const { state, collectionSync: sync, syncCollection, importGuestCards, keepGuestSeparate, resolveCollectionConflict } = useChase();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [confirmCloud, setConfirmCloud] = useState<string | null>(null);
  if (!sync.owner || !sync.account) return null;
  const account = sync.account; const conflicts = Object.values(account.conflicts);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(null);
    try { await action(); syncCollection(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this choice. Please retry.'); }
    finally { setBusy(false); setConfirmCloud(null); }
  };
  const message = sync.syncing ? 'Syncing…' : conflicts.length ? `${conflicts.length} quantity conflicts to review`
    : sync.error ? sync.error : account.pending.length ? `${account.pending.length} changes waiting to sync`
    : account.lastSynced ? 'Up to date' : 'Not synced yet';
  return <View style={{ gap: 12 }}>
    <Section title="Collection backup" />
    <Label accessibilityLiveRegion="polite" kind="caption" style={uiStyles.muted}>{message}</Label>
    <Button title="Sync now" variant="secondary" icon="sync-outline" loading={sync.syncing} disabled={busy} onPress={syncCollection} />
    {account.importDecision !== 'imported' && sync.guestCopies > 0 ? <View style={{ gap: 8 }}>
      <Label style={{ fontWeight: '600' }}>{sync.guestCopies} guest copies on this device</Label>
      <Label kind="caption" style={uiStyles.muted}>Import them once into this account? The originals will stay in your guest collection.</Label>
      <Button title="Import guest cards" disabled={busy} onPress={() => { void run(importGuestCards); }} />
      {account.importDecision === 'pending' ? <Button title="Keep guest cards separate" variant="ghost" disabled={busy} onPress={() => { void run(keepGuestSeparate); }} /> : null}
    </View> : null}
    {conflicts.map(remote => {
      const local = state.items.find(item => item.cardId === remote.cardId);
      const name = getCatalogCard(remote.cardId)?.name ?? local?.card?.name ?? remote.item?.card?.name ?? 'Card';
      return <View key={remote.cardId} style={{ gap: 8, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border }}>
        <Label style={{ fontWeight: '600' }}>{name}</Label>
        <Label kind="caption">This device: {local?.quantity ?? 0} · Cloud: {remote.item?.quantity ?? 0}</Label>
        {confirmCloud === remote.cardId ? <>
          <Label accessibilityRole="alert">Replace the local quantity with the cloud quantity?</Label>
          <Button title={`Confirm cloud quantity for ${name}`} variant="danger" disabled={busy} onPress={() => { void run(() => resolveCollectionConflict(remote.cardId, false)); }} />
          <Button title="Cancel" variant="ghost" onPress={() => setConfirmCloud(null)} />
        </> : <>
          <Button title={`Keep my quantity for ${name}`} variant="secondary" disabled={busy} onPress={() => { void run(() => resolveCollectionConflict(remote.cardId, true)); }} />
          <Button title={`Use cloud quantity for ${name}`} variant="ghost" disabled={busy} onPress={() => setConfirmCloud(remote.cardId)} />
        </>}
      </View>;
    })}
    {error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
  </View>;
}
