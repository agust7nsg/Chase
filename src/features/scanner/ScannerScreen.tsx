import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, uiStyles } from '@/components/ui';
import { CardStage } from '@/components/CardArtwork';
import { CollectorBackdrop } from '@/components/CollectorScene';
import { CardPrint } from '@/components/CardPrint';
import { getCatalogCard } from '@/data/mocks/catalog';
import { money } from '@/components/CardRow';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import type { Card } from '@/types/domain';
import { canScan } from '@/services';
export default function ScannerScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { state, recognize, addToCollection } = useChase();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const addedRef = useRef(false);
  const scanController = useRef<AbortController | null>(null);
  useEffect(() => () => { scanController.current?.abort(); }, []);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const needsPro = !canScan(state);
  const openPaywall = () => router.replace({ pathname: '/paywall', params: { onboarding } });
  const scan = async () => {
    if (needsPro) { openPaywall(); return; }
    const controller = new AbortController();
    scanController.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await recognize(simulateFailure, controller.signal);
      if (!controller.signal.aborted) { setCard(result); setAdded(false); addedRef.current = false; }
    }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Sample recognition failed. Please try again.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const add = () => {
    if (!card || addedRef.current) return;
    addedRef.current = true;
    const result = addToCollection(card.id);
    if (result.ok) { setAdded(true); setError(null); }
    else { addedRef.current = false; setError(result.message); }
  };
  if (card) return <Screen safeTop={false}>
    <View style={{ gap: 10 }}><Badge>SIMULATED RESULT</Badge><Label kind="title">A familiar favorite.</Label><Label style={uiStyles.muted}>Sample recognition complete. Confirm before saving.</Label></View>
    <CardStage card={card} compact />
    <View style={{ gap: 8 }}><Label kind="heading">{card.name}</Label><Label style={uiStyles.muted}>{card.setName} · {card.collectorNumber}</Label><Label style={uiStyles.muted}>{card.variant}</Label><View style={uiStyles.between}><Label>Estimated USD price</Label><Label kind="heading">{money(card.marketPrice.amount)}</Label></View><Label kind="caption" style={uiStyles.muted}>Illustrative price and simulated recognition. Estimates aren’t guaranteed resale values.</Label></View>
    {error ? <Label style={{ color: colors.danger }} accessibilityRole="alert">{error}</Label> : null}
    {added ? <Panel><View style={uiStyles.row}><Icon name="checkmark-circle-outline" color={colors.success} /><Label style={{ color: colors.success }} accessibilityLiveRegion="polite">One copy saved to your collection.</Label></View>{onboarding !== '1' ? <Button title="View collection" variant="ghost" onPress={() => router.replace('/(tabs)/collection')} /> : null}</Panel> : <Button title="Add to Collection" icon="add-outline" onPress={add} />}
    {onboarding === '1' ? <Button title="Continue" variant="secondary" onPress={openPaywall} /> : <Button title="Scan another card" variant="secondary" onPress={() => { if (needsPro) openPaywall(); else { setCard(null); setError(null); } }} />}
  </Screen>;
  return <Screen safeTop={false}>
    <Badge>SCANNER DEMONSTRATION</Badge><View style={{ gap: 8 }}><Label kind="title">Discover what{`\n`}you’re holding.</Label><Label style={uiStyles.muted}>Demo recognition, with no camera access.</Label></View>
    <View style={styles.frame}>
      <CollectorBackdrop mood="sky" />
      <View style={styles.inner}>
        <View style={styles.reference} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><CardPrint card={getCatalogCard('xyp-XY133')!} /></View>
        <View style={styles.scanLabel}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : <Icon name="scan-outline" size={32} color={colors.primary} />}<Label style={{ fontWeight: '700', textAlign: 'center' }}>{loading ? 'Identifying sample card…' : 'Your card goes here'}</Label><Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>{loading ? 'Running the mock recognition service' : 'Example artwork · camera inactive'}</Label></View>
      </View>
    </View>
    {error ? <Panel><Label style={{ color: colors.danger }} accessibilityRole="alert">{error}</Label><Label kind="caption" style={uiStyles.muted}>An unsuccessful recognition does not use your free trial.</Label></Panel> : null}
    <Button title={needsPro ? 'Explore Chase Pro' : state.plan === 'pro' ? 'Run sample scan' : 'Use my free sample scan'} icon="scan-outline" loading={loading} onPress={() => { void scan(); }} />
    <Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>{state.plan === 'pro' ? 'Development Pro access is simulated.' : needsPro ? 'Your complimentary successful identification has been used.' : 'Only a successful result uses your free scan.'}</Label>
    {__DEV__ ? <View style={uiStyles.between}><View style={{ flex: 1 }}><Label kind="caption">Development only</Label><Label kind="caption" style={uiStyles.muted}>Simulate failed recognition</Label></View><Switch value={simulateFailure} onValueChange={setSimulateFailure} disabled={loading} accessibilityLabel="Development only: simulate failed recognition" trackColor={{ true: colors.primary }} /></View> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  frame: { marginHorizontal: -24, padding: 24, minHeight: 310, overflow: 'hidden' },
  inner: { flex: 1, minHeight: 272, alignItems: 'center', justifyContent: 'flex-end', gap: 18 },
  reference: { width: 142, position: 'absolute', top: 4, transform: [{ rotate: '-6deg' }] },
  scanLabel: { padding: 16, alignSelf: 'stretch', gap: 6, alignItems: 'center', backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.tintBorder },
});
