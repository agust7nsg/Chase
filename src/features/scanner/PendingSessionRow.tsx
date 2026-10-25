import { useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Label, uiStyles } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { colors } from '@/theme/tokens';
import type { PendingCatalogRecognition } from '@/types/scanner';
import { useScanSession } from './ScanSessionProvider';

export function PendingSessionRow({ item }: { item: PendingCatalogRecognition }) {
  const scan = useScanSession();
  const candidate = item.recognition.candidates[0];
  const preview = item.reviewChoices?.[0];
  const [details, setDetails] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = working || scan.busy;
  const attempt = async (action: () => Promise<unknown>) => {
    setWorking(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Please retry.'); }
    finally { setWorking(false); }
  };
  return <View style={styles.row}>
    <View style={styles.top}>{preview ? <CardPrint card={preview} style={{ width: 52 }} /> : <View style={styles.placeholder}><Icon name="albums-outline" size={28} color={colors.primary} /></View>}
      <View style={{ flex: 1, gap: 4 }}><Label style={{ fontWeight: '700' }}>{candidate.name}</Label>
        <Label kind="caption" style={uiStyles.muted}>{candidate.setName} · {candidate.collectorNumber}</Label>
        <Label kind="caption" style={uiStyles.muted}>{preview ? 'Review printing' : 'Pending catalog match'} · Price unavailable</Label></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Scan details for ${candidate.name}`} onPress={() => setDetails(true)} style={styles.icon}>
        <Icon name="information-circle-outline" color={colors.muted} /></Pressable>
    </View>
    <View style={styles.top}>
      <View style={[styles.top, { backgroundColor: colors.white, borderRadius: 10 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease pending ${candidate.name} quantity`} disabled={busy || item.quantity <= 1}
          onPress={() => { void attempt(() => scan.quantity(item.id, item.quantity - 1)); }} style={styles.icon}><Icon name="remove" color={item.quantity <= 1 ? colors.muted : colors.primary} /></Pressable>
        <Label>{item.quantity}</Label>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase pending ${candidate.name} quantity`} disabled={busy}
          onPress={() => { void attempt(() => scan.quantity(item.id, item.quantity + 1)); }} style={styles.icon}><Icon name="add" color={colors.primary} /></Pressable>
      </View>
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove unmatched ${candidate.name}`} disabled={busy}
        onPress={() => { void attempt(() => scan.remove(item.id)); }} style={styles.icon}><Icon name="trash-outline" color={colors.muted} /></Pressable>
    </View>
    <Button title={`${preview ? 'Review' : 'Match'} ${candidate.name} printing`} variant="secondary" disabled={busy}
      onPress={() => router.push({ pathname: '/match-scan/[id]', params: { id: item.id } })} />
    {!preview ? <Button title="Retry catalog match" variant="ghost" loading={working} disabled={scan.busy}
      onPress={() => { void attempt(() => scan.retryPending(item.id)); }} /> : null}
    {error ? <Label kind="caption" accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
    <Modal transparent visible={details} animationType="fade" onRequestClose={() => setDetails(false)}>
      <View style={styles.scrim}><View style={styles.dialog} accessibilityViewIsModal>
        <Label kind="heading">Scan details</Label>
        <ScrollView><Label kind="caption" selectable>{JSON.stringify({ identifiedAt: item.identifiedAt, ...item.diagnostics,
          candidates: item.recognition.candidates }, null, 2)}</Label></ScrollView>
        <Button title="Close scan details" variant="secondary" onPress={() => setDetails(false)} />
      </View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  row: { paddingVertical: 16, gap: 8, borderTopWidth: 1, borderColor: colors.border },
  top: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  placeholder: { width: 52, height: 72, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  icon: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.scrim },
  dialog: { maxHeight: '85%', padding: 20, gap: 16, backgroundColor: colors.white, borderRadius: 20 },
});
