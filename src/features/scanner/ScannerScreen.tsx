import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, Icon, Label, uiStyles } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { colors } from '@/theme/tokens';
import { getCatalogCard } from '@/data/mocks/catalog';
import { ScannerController } from '@/services/scannerController';
import { MockCardFrameSource } from '@/services/mockCardFrames';
import { useScanSession } from './ScanSessionProvider';
import { ScannerCamera } from './ScannerCamera';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import type { ScannerStatus, ScanSessionItem } from '@/types/scanner';

export default function ScannerScreen() {
  const scan = useScanSession();
  const focused = useIsFocused();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [cameraVisible, setCameraVisible] = useState(false);
  const [status, setStatus] = useState<ScannerStatus>({ phase: 'SEARCHING', cardId: null, error: null });
  const [scene, setScene] = useState<{ cardId: string | null; automatic: boolean }>({ cardId: null, automatic: false });
  const [showTools, setShowTools] = useState(false);
  const [source] = useState(() => new MockCardFrameSource((cardId, automatic) => setScene({ cardId, automatic })));
  const [controller] = useState(() => new ScannerController(async () => { throw new Error('Scanner is loading.'); }, setStatus));
  useEffect(() => { controller.setRecognizer(scan.identify); });
  useEffect(() => { const listener = AppState.addEventListener('change', value => setAppActive(value === 'active')); return () => listener.remove(); }, []);
  useFocusEffect(useCallback(() => {
    if (!appActive || !scan.ready || scan.loadError) return;
    controller.resume();
    const stop = source.start(frame => controller.observe(frame, Date.now()));
    return () => { stop(); controller.pause(); };
  }, [appActive, scan.ready, scan.loadError, source, controller]));
  useEffect(() => () => { controller.dispose(); }, [controller]);
  useEffect(() => { if (!scan.allowed) source.setAutomatic(false); }, [scan.allowed, source]);
  const paywall = () => router.push({ pathname: '/paywall', params: { returnTo: 'scanner' } });
  const exit = () => { if (onboarding === '1') router.replace({ pathname: '/paywall', params: { onboarding } }); else if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  const result = scan.session.items.find(item => item.cardId === status.cardId);
  const sceneCard = getCatalogCard(scene.cardId ?? '');
  const working = status.phase === 'IDENTIFYING' || status.phase === 'CARD_CANDIDATE';
  const title = status.phase === 'IDENTIFYING' ? 'Identifying…' : status.phase === 'CARD_CANDIDATE' ? 'Hold steady' : status.phase === 'WAITING_FOR_CARD_CHANGE' ? 'Ready for the next card' : 'Center a card';
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    {focused ? <StatusBar style="light" /> : null}
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close scanner, keep pending cards" onPress={exit} style={styles.iconButton}><Icon name="close" color={colors.white} size={26} /></Pressable>
      <Label style={styles.headerTitle}>Scanner</Label>
      <View style={styles.demoBadge}><Label kind="caption" style={{ color: colors.scannerMuted }}>Demo recognition</Label></View>
    </View>
    <View style={styles.camera}>
      <ScannerCamera active={focused && appActive && scan.ready} onVisible={setCameraVisible} />
      <View pointerEvents="none" style={styles.guideArea}>
        <View style={styles.guide}>
          {!cameraVisible && sceneCard ? <CardPrint card={sceneCard} style={{ width: '82%', opacity: 0.8 }} /> : !cameraVisible ? <Icon name="scan-outline" size={56} color={colors.scannerFrame} /> : null}
          {['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map(corner => <View key={corner} style={[styles.corner, styles[corner as 'topLeft']]} />)}
        </View>
      </View>
      <View style={styles.resultArea}>
        {status.phase === 'RESULT_READY' && result ? <RecognitionOverlay key={result.identifiedAt + status.cardId} item={result} count={scan.summary.copies} /> : <View style={styles.status}>
          {working ? <ActivityIndicator color={colors.white} /> : <Icon name={status.phase === 'ERROR' ? 'alert-circle-outline' : 'scan-outline'} color={colors.white} size={18} />}
          <Label kind="caption" style={{ color: colors.white, flexShrink: 1 }}>{status.phase === 'ERROR' ? status.error : title}</Label>
        </View>}
      </View>
    </View>
    <ScrollView style={styles.controls} contentContainerStyle={{ gap: 10, padding: 16 }}>
      {scan.loadError ? <><Label accessibilityRole="alert" style={{ color: colors.white }}>{scan.loadError}</Label><Button title="Retry pending scans" variant="inverse" onPress={scan.retryLoad} /></> : !scan.ready ? <ActivityIndicator color={colors.white} /> : <>
        {scan.error ? <Label accessibilityRole="alert" kind="caption" style={{ color: colors.white }}>{scan.error}</Label> : null}
        {status.phase === 'ERROR' ? <Button title="Retry identification" variant="inverse" onPress={() => { if (scan.allowed) controller.retry(); else paywall(); }} /> : null}
        {scan.allowed ? <View style={styles.demoActions}>
          <View style={{ flex: 1 }}><Button title={scene.automatic ? 'Pause demo' : 'Start demo'} icon={scene.automatic ? 'pause-outline' : 'play-outline'} variant="inverse" onPress={() => source.setAutomatic(!scene.automatic)} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Present next demo card" style={styles.iconButton} onPress={() => { source.setAutomatic(false); source.next(); }}><Icon name="play-skip-forward-outline" color={colors.white} /></Pressable>
        </View> : <Button title="Explore Chase Pro" variant="inverse" onPress={paywall} />}
        <View style={styles.demoActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove demo card from frame" onPress={() => source.remove()} style={styles.textButton}><Label kind="caption" style={styles.quiet}>Remove card</Label></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Present same demo card again" onPress={() => { if (scan.allowed) source.presentSame(); else paywall(); }} style={styles.textButton}><Label kind="caption" style={styles.quiet}>Present same card</Label></Pressable>
          {__DEV__ ? <Pressable accessibilityRole="button" accessibilityLabel="Demo test controls" onPress={() => setShowTools(!showTools)} style={styles.iconButton}><Icon name="options-outline" color={colors.scannerMuted} /></Pressable> : null}
        </View>
        {__DEV__ && showTools ? <View style={{ gap: 8 }}>
          {([['fail', 'Simulate failed recognition'], ['missingPrice', 'Simulate unavailable price'], ['ambiguous', 'Simulate variant review']] as const).map(([key, label]) => <View key={key} style={uiStyles.between}><Label kind="caption" style={[styles.quiet, { flex: 1 }]}>{label}</Label><Switch value={scan.options[key]} onValueChange={value => scan.setOptions({ ...scan.options, [key]: value })} accessibilityLabel={`Development only: ${label.toLowerCase()}`} /></View>)}
        </View> : null}
      </>}
    </ScrollView>
    <View style={styles.bottom}><Button title={`Organize (${scan.summary.copies})`} icon="albums-outline" disabled={!scan.ready} onPress={() => router.push({ pathname: '/organize', params: { onboarding } })} /></View>
  </SafeAreaView>;
}
function RecognitionOverlay({ item, count }: { item: ScanSessionItem; count: number }) {
  const { formatMoney } = useCurrency();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (active) Animated.timing(opacity, { toValue: 1, duration: reduce ? 0 : 180, useNativeDriver: true }).start(); });
    return () => { active = false; opacity.stopAnimation(); };
  }, [opacity]);
  const card = getCatalogCard(item.cardId)!;
  return <Animated.View style={[styles.result, { opacity }]} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${item.name}. ${count} pending cards. ${item.priceState === 'available' && item.price ? formatMoney(item.price.amount, item.price.currency) : item.priceState === 'loading' ? 'Price loading' : 'Price unavailable'}`}>
    <CardPrint card={card} style={{ width: 42 }} />
    <View style={{ flex: 1, gap: 2 }}><Label style={{ fontWeight: '700' }}>{item.name}</Label><Label kind="caption" style={{ color: colors.muted }}>{item.setName} · {item.collectorNumber}</Label><Label kind="caption" style={{ color: colors.primary }}>{item.ambiguity === 'review' ? 'Review variant in Organize' : 'Added to session'}</Label></View>
    <Label style={{ fontWeight: '700', flexShrink: 1 }}>{item.priceState === 'available' && item.price ? formatMoney(item.price.amount, item.price.currency) : item.priceState === 'loading' ? 'Loading…' : 'Price unavailable'}</Label>
  </Animated.View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.scanner },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, flexWrap: 'wrap' },
  headerTitle: { color: colors.white, fontWeight: '700', flex: 1 },
  demoBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.scannerOrbitLine },
  camera: { flex: 1, minHeight: 200, overflow: 'hidden', backgroundColor: colors.heroInk },
  guideArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingBottom: 72 },
  guide: { height: '100%', maxHeight: 340, aspectRatio: 600 / 825, maxWidth: '70%', alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.scannerFrame },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 10 },
  resultArea: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  result: { backgroundColor: colors.white, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: colors.scanner },
  controls: { flexGrow: 0, maxHeight: '36%' },
  bottom: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  demoActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textButton: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  quiet: { color: colors.scannerMuted, textAlign: 'center' },
});
