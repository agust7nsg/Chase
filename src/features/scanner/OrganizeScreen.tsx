import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, Icon, Label, uiStyles } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { colors } from '@/theme/tokens';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useChase } from '@/features/app/ChaseProvider';
import { getCatalogCard } from '@/data/mocks/catalog';
import { variantsFor } from '@/services/scanSession';
import { catalogService } from '@/services/catalog';
import type { Card } from '@/types/domain';
import type { ScanSessionItem, PendingCatalogRecognition } from '@/types/scanner';
import { useScanSession } from './ScanSessionProvider';
import { PendingSessionRow } from './PendingSessionRow';

export default function OrganizeScreen() {
  const scan = useScanSession();
  const { state } = useChase();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { currency, formatMoney } = useCurrency();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const receipts = new Set(state.savedScanOperations ?? []);
  const items = scan.session.items.filter(item => !receipts.has(item.operationId));
  const pending = scan.session.unresolved ?? [];
  const rows: ({ kind: 'card'; item: ScanSessionItem } | { kind: 'pending'; item: PendingCatalogRecognition })[] = [
    ...items.map(item => ({ kind: 'card' as const, item })), ...pending.map(item => ({ kind: 'pending' as const, item })),
  ];
  const selected = items.filter(item => !excluded.includes(item.id));
  const back = () => { if (router.canGoBack()) router.back(); else router.replace({ pathname: '/scanner', params: { onboarding } }); };
  const attempt = async (action: () => Promise<unknown>) => { try { await action(); setFeedback(null); } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Please try again.'); } };
  const save = async (ids: string[]) => {
    try {
      const result = await scan.save(ids);
      setFeedback([result.saved ? `${result.saved} ${result.saved === 1 ? 'copy' : 'copies'} saved to Collection.` : '', ...new Set(result.messages)].filter(Boolean).join(' '));
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Save failed. Your pending cards are safe.'); }
  };
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <StatusBar style="dark" />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Return to Scanner" onPress={back} style={styles.icon}><Icon name="chevron-back" color={colors.primary} /></Pressable>
      <Label kind="heading" accessibilityRole="header" style={{ flex: 1 }}>Organize</Label>
      <Pressable accessibilityRole="button" accessibilityLabel="Discard pending session" disabled={!rows.length || scan.busy} onPress={() => setConfirmDiscard(true)} style={styles.icon}><Icon name="trash-outline" color={colors.muted} /></Pressable>
    </View>
    <FlatList data={rows} keyExtractor={row => row.item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={{ gap: 8, paddingBottom: 16 }}>
        <View style={uiStyles.between}><Label style={{ fontWeight: '600' }}>{scan.summary.copies} pending {scan.summary.copies === 1 ? 'card' : 'cards'}</Label><Label kind="heading">{scan.summary.copies > 0 && scan.summary.unpriced === scan.summary.copies ? '—' : formatMoney(scan.summary.value)}</Label></View>
        <Label kind="caption" style={uiStyles.muted}>{pending.length || items.some(item => item.card?.catalogIdentity) ? 'Market estimate' : 'Sample estimate'} · {currency}{scan.summary.unpriced ? ` · ${scan.summary.unpriced} unpriced` : ''}</Label>
        {scan.loadError ? <><Label accessibilityRole="alert">{scan.loadError}</Label><Button title="Retry pending scans" onPress={scan.retryLoad} /></> : null}
        {feedback || scan.error ? <Label accessibilityRole="alert" style={{ color: colors.primary }}>{feedback ?? scan.error}</Label> : null}
        {items.some(item => item.ambiguity === 'confirmed' && item.priceState === 'unavailable') ? <Button title="Retry prices" variant="ghost" onPress={scan.retryPrices} /> : null}
      </View>}
      ListEmptyComponent={<View style={styles.empty}><Icon name="scan-outline" size={40} color={colors.primary} /><Label kind="heading">No pending cards</Label><Button title="Return to Scanner" variant="secondary" onPress={back} /></View>}
      renderItem={({ item: row }) => row.kind === 'pending' ? <PendingSessionRow item={row.item} /> : <SessionRow item={row.item} selected={!excluded.includes(row.item.id)} busy={scan.busy}
        toggle={() => setExcluded(previous => previous.includes(row.item.id) ? previous.filter(id => id !== row.item.id) : [...previous, row.item.id])}
        onQuantity={quantity => { void attempt(() => scan.quantity(row.item.id, quantity)); }}
        onVariant={cardId => { void attempt(() => scan.variant(row.item.id, cardId)); }}
        onRemove={() => { void attempt(() => scan.remove(row.item.id)); }} />}
    />
    <View style={styles.footer}>
      <Button title="Save all to Collection" icon="checkmark-outline" disabled={!items.length || !scan.ready} loading={scan.busy} onPress={() => { void save(items.map(item => item.id)); }} />
      <View style={styles.footerRow}><View style={{ flex: 1 }}><Button title={`Save selected (${selected.reduce((sum, item) => sum + item.quantity, 0)})`} variant="secondary" disabled={!selected.length || scan.busy} onPress={() => { void save(selected.map(item => item.id)); }} /></View><Pressable accessibilityRole="button" accessibilityLabel="Return to Scanner" onPress={back} style={styles.icon}><Icon name="camera-outline" color={colors.primary} /></Pressable></View>
      {feedback?.includes('Free collections') ? <Button title="Explore Chase Pro" variant="ghost" onPress={() => router.push({ pathname: '/paywall', params: { returnTo: 'organize' } })} /> : null}
      {onboarding === '1' ? <Button title="Continue" variant="ghost" onPress={() => router.replace({ pathname: '/paywall', params: { onboarding } })} /> : null}
    </View>
    <Modal transparent visible={confirmDiscard} animationType="fade" onRequestClose={() => setConfirmDiscard(false)}>
      <View style={styles.scrim}><View style={styles.dialog} accessibilityViewIsModal>
        <Label kind="heading">Discard pending cards?</Label><Label>Your Collection stays saved.</Label>
        <Button title="Keep session" variant="secondary" onPress={() => setConfirmDiscard(false)} />
        <Button title="Discard session" variant="danger" onPress={() => { setConfirmDiscard(false); void attempt(scan.discard); }} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}

function SessionRow({ item, selected, busy, toggle, onQuantity, onVariant, onRemove }: { item: ScanSessionItem; selected: boolean; busy: boolean; toggle: () => void; onQuantity: (quantity: number) => void; onVariant: (id: string) => void; onRemove: () => void }) {
  const { formatMoney } = useCurrency();
  const [editingVariant, setEditingVariant] = useState(false);
  const [variants, setVariants] = useState<Card[]>(() => variantsFor(item.cardId));
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const card = item.card ?? getCatalogCard(item.cardId)!;
  const canChooseVariant = (card.availableVariants?.length ?? variants.length) > 1 || card.variant === 'Unspecified';
  const reviewVariants = async () => {
    if (loadingVariants) return;
    setEditingVariant(true); setVariantError(null);
    if (!card.catalogIdentity) { setVariants(variantsFor(card.id)); return; }
    setLoadingVariants(true);
    try { setVariants(await catalogService.getVariants(card.id)); }
    catch { setVariantError('Variants could not be loaded. Your current selection is kept.'); }
    finally { setLoadingVariants(false); }
  };
  return <View style={styles.row}>
    <View style={styles.rowTop}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select ${item.name}, ${item.variant}`} accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={toggle} style={styles.icon}><Icon name={selected ? 'checkbox' : 'square-outline'} color={colors.primary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Details for pending ${item.name}, ${item.variant}`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id, fromScan: '1' } })}><CardPrint card={card} style={{ width: 52 }} /></Pressable>
      <View style={{ flex: 1, gap: 3 }}><Label style={{ fontWeight: '700' }}>{item.name}</Label><Label kind="caption" style={uiStyles.muted}>{item.setName} · {item.collectorNumber}</Label><Label kind="caption" style={{ fontWeight: '600' }}>{item.priceState === 'available' && item.price ? formatMoney(Math.round(item.price.amount * 100) * item.quantity / 100, item.price.currency) : item.priceState === 'loading' ? 'Price loading…' : 'Price unavailable'}</Label></View>
    </View>
    <View style={[styles.rowTools, { flexWrap: 'wrap' }]}>
      {canChooseVariant ? <Pressable accessibilityRole="button" accessibilityLabel={`Review ${item.name} variant`} disabled={busy || loadingVariants} onPress={() => { if (editingVariant) setEditingVariant(false); else void reviewVariants(); }} style={styles.variant}><Label kind="caption" style={{ color: item.ambiguity === 'review' ? colors.danger : colors.primary }}>{item.ambiguity === 'review' ? 'Review: ' : ''}{item.variant}</Label><Icon name="chevron-down" size={16} color={colors.primary} /></Pressable>
        : item.ambiguity === 'review' ? <Button title="Confirm printing" variant="ghost" disabled={busy} onPress={() => onVariant(card.id)} />
          : <Label kind="caption" style={uiStyles.muted}>{item.variant}</Label>}
      <View style={styles.quantity}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease pending ${item.name} quantity`} accessibilityState={{ disabled: busy || item.quantity <= 1 }} disabled={busy || item.quantity <= 1} onPress={() => onQuantity(item.quantity - 1)} style={styles.icon}><Icon name="remove" size={20} color={item.quantity <= 1 ? colors.muted : colors.primary} /></Pressable>
        <Label accessibilityLabel={`${item.quantity} pending copies`} style={{ minWidth: 22, textAlign: 'center', fontWeight: '600' }}>{item.quantity}</Label>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase pending ${item.name} quantity`} disabled={busy} onPress={() => onQuantity(item.quantity + 1)} style={styles.icon}><Icon name="add" size={20} color={colors.primary} /></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove pending ${item.name}, ${item.variant}`} disabled={busy} onPress={onRemove} style={styles.icon}><Icon name="trash-outline" size={19} color={colors.muted} /></Pressable>
    </View>
    {editingVariant ? <View style={{ gap: 6 }}>{loadingVariants ? <Label kind="caption">Loading variants…</Label> : null}{variantError ? <><Label accessibilityRole="alert">{variantError}</Label><Button title="Retry variants" variant="ghost" onPress={() => { void reviewVariants(); }} /></> : null}{variants.map(variant => <Button key={variant.id} title={`Confirm ${variant.variant}`} variant="secondary" disabled={busy || loadingVariants} onPress={() => { onVariant(variant.id); setEditingVariant(false); }} />)}</View> : null}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
  row: { paddingVertical: 16, gap: 8, borderTopWidth: 1, borderColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  variant: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  quantity: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: colors.white },
  icon: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: 16, gap: 8, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 40 },
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  dialog: { padding: 24, borderRadius: 20, backgroundColor: colors.white, gap: 16, maxWidth: 420, width: '100%', alignSelf: 'center' },
});
