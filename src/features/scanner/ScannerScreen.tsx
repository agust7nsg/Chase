import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, uiStyles } from '@/components/ui';
import { CardStage } from '@/components/CardArtwork';
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
    <View style={{ gap: 10 }}><Badge>SIMULATED RESULT</Badge><Label kind="title">Review your card</Label><Label style={uiStyles.muted}>Sample recognition complete. Confirm before saving.</Label></View>
    <CardStage card={card} compact />
    <View style={{ gap: 8 }}><Label kind="heading">{card.name}</Label><Label style={uiStyles.muted}>{card.setName} · {card.collectorNumber}</Label><Label style={uiStyles.muted}>{card.variant}</Label><View style={uiStyles.between}><Label>Estimated USD price</Label><Label kind="heading">{money(card.marketPrice.amount)}</Label></View><Label kind="caption" style={uiStyles.muted}>Illustrative price and simulated recognition. Estimates aren’t guaranteed resale values.</Label></View>
    {error ? <Label style={{ color: colors.danger }} accessibilityRole="alert">{error}</Label> : null}
    {added ? <Panel><View style={uiStyles.row}><Icon name="checkmark-circle-outline" color={colors.success} /><Label style={{ color: colors.success }} accessibilityLiveRegion="polite">One copy saved to your collection.</Label></View>{onboarding !== '1' ? <Button title="View collection" variant="ghost" onPress={() => router.replace('/(tabs)/collection')} /> : null}</Panel> : <Button title="Add to Collection" icon="add-outline" onPress={add} />}
    {onboarding === '1' ? <Button title="Continue" variant="secondary" onPress={openPaywall} /> : <Button title="Scan another card" variant="secondary" onPress={() => { if (needsPro) openPaywall(); else { setCard(null); setError(null); } }} />}
  </Screen>;
  return <Screen safeTop={false}>
    <View style={{ gap: 8 }}><Label kind="title" accessibilityRole="header">Identify a card</Label><Label style={uiStyles.muted}>Identify a printing, review its price, then choose whether to save it.</Label></View>
    <View style={styles.frame}>
      <View style={styles.frameHeader}><Icon name="camera-outline" size={18} color={colors.scannerMuted} /><Label kind="caption" style={{ color: colors.scannerMuted }}>Camera inactive · demo</Label></View>
      <View style={styles.guide}>
        <View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} /><View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} />
        {loading ? <ActivityIndicator size="large" color={colors.white} /> : <Icon name="scan-outline" size={40} color={colors.white} />}
        <Label style={{ color: colors.white, textAlign: 'center', fontWeight: '600' }}>{loading ? 'Identifying sample card…' : 'Center one card'}</Label>
        <Label kind="caption" style={{ color: colors.scannerMuted, textAlign: 'center' }}>{loading ? 'Please wait for the result' : 'Keep all four corners inside the guide'}</Label>
      </View>
      <Label kind="caption" style={{ color: colors.scannerMuted, textAlign: 'center' }}>This preview runs a sample scan without opening your camera.</Label>
    </View>
    <View style={styles.tips}><Icon name="sunny-outline" color={colors.muted} size={18} /><Label kind="caption" style={uiStyles.muted}>For a real scan: even light, no glare, one card at a time.</Label></View>
    {error ? <Panel><Label style={{ color: colors.danger }} accessibilityRole="alert">{error}</Label><Label kind="caption" style={uiStyles.muted}>An unsuccessful recognition does not use your free trial.</Label></Panel> : null}
    <Button title={needsPro ? 'Explore Chase Pro' : state.plan === 'pro' ? 'Run sample scan' : 'Use my free sample scan'} icon="scan-outline" loading={loading} onPress={() => { void scan(); }} />
    <Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>{state.plan === 'pro' ? 'Development Pro access is simulated.' : needsPro ? 'Your complimentary successful identification has been used.' : 'Only a successful result uses your free scan.'}</Label>
    {__DEV__ ? <View style={uiStyles.between}><View style={{ flex: 1 }}><Label kind="caption">Development only</Label><Label kind="caption" style={uiStyles.muted}>Simulate failed recognition</Label></View><Switch value={simulateFailure} onValueChange={setSimulateFailure} disabled={loading} accessibilityLabel="Development only: simulate failed recognition" trackColor={{ true: colors.primary }} /></View> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  frame: { padding: 20, backgroundColor: colors.scanner, borderRadius: 20, alignItems: 'center', gap: 20 },
  frameHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  guide: { width: '100%', maxWidth: 210, aspectRatio: 600 / 825, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: colors.white },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 7 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 7 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 7 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 7 },
  tips: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
