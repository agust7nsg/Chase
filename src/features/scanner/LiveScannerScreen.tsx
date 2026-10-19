import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, Icon, Label } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { ScannerController } from '@/services/scannerController';
import { LiveCardPresentationTracker } from '@/services/liveCardFrames';
import { liveScannerConfig } from '@/services/cardsight/config';
import { colors } from '@/theme/tokens';
import type { Card } from '@/types/domain';
import type { ScannerStatus } from '@/types/scanner';
import { useScanSession } from './ScanSessionProvider';
import { LiveScannerCamera, type LiveCameraHandle } from './LiveScannerCamera';
import { RecognitionOverlay } from './RecognitionOverlay';

export function LiveScannerScreen({ onDemo }: { onDemo: () => void }) {
  const scan = useScanSession();
  const focused = useIsFocused();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [paused, setPaused] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [status, setStatus] = useState<ScannerStatus>({ phase: 'SEARCHING', cardId: null, error: null });
  const [review, setReview] = useState<Card[] | null>(null);
  const chooser = useRef<{ finish: (card?: Card) => void } | null>(null);
  const camera = useRef<LiveCameraHandle>(null);
  const allowed = useRef(scan.allowed);
  useEffect(() => { allowed.current = scan.allowed; }, [scan.allowed]);
  const [tracker] = useState(() => new LiveCardPresentationTracker());
  const [controller] = useState(() => new ScannerController(async () => { throw new Error('Scanner is loading.'); }, setStatus));
  const chooseCandidate = useCallback((cards: Card[], signal?: AbortSignal) => new Promise<Card>((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Recognition canceled.')); return; }
    const cancel = () => finish();
    const finish = (card?: Card) => { signal?.removeEventListener('abort', cancel); chooser.current = null; setReview(null); if (card) resolve(card); else reject(new Error('Printing selection canceled. Retry when ready.')); };
    chooser.current = { finish }; setReview(cards);
    signal?.addEventListener('abort', cancel, { once: true });
  }), []);
  useEffect(() => { controller.setRecognizer((frame, signal) => scan.identify(frame, signal, { mode: 'live', chooseCandidate })); });
  useEffect(() => { const subscription = AppState.addEventListener('change', value => setAppActive(value === 'active')); return () => subscription.remove(); }, []);
  useEffect(() => {
    if (!liveScannerConfig || !focused || !appActive) return;
    const abort = new AbortController();
    let stopped = false;
    const timer = setTimeout(() => abort.abort(), 5000);
    void fetch(`${liveScannerConfig.proxyUrl}/health`, { signal: abort.signal }).then(async response => {
      const value: unknown = await response.json();
      const ready = response.ok && value && typeof value === 'object' && 'ready' in value && value.ready === true
        && 'mode' in value && value.mode === 'local-development';
      if (!stopped) setConnection(ready ? 'ready' : 'unavailable');
    }).catch(() => { if (!stopped) setConnection('unavailable'); }).finally(() => clearTimeout(timer));
    return () => { stopped = true; clearTimeout(timer); abort.abort(); };
  }, [focused, appActive, connectionAttempt]);
  const active = focused && appActive && scan.ready && !scan.loadError && connection === 'ready' && Boolean(liveScannerConfig) && !paused;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    controller.resume(); tracker.resetCandidates();
    const tick = async () => {
      if (stopped) return;
      controller.tick(Date.now());
      if (allowed.current && !chooser.current) {
        try {
          const captured = await camera.current?.capture();
          if (stopped) return;
          if (captured) {
            setCaptureError(null);
            const frame = tracker.observe(captured.observation, Date.now());
            if (frame !== undefined) controller.observe(frame ? { ...frame, image: captured.image } : null, Date.now());
          }
        } catch { if (!stopped) { tracker.resetCandidates(); setCaptureError('Camera capture failed. Keep the card steady and retry.'); } }
      }
      if (!stopped) timer = setTimeout(() => { void tick(); }, 650);
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); controller.pause(); tracker.resetCandidates(); };
  }, [active, controller, tracker]);
  useEffect(() => () => { controller.dispose(); chooser.current?.finish(); }, [controller]);
  const paywall = () => router.push({ pathname: '/paywall', params: { returnTo: 'scanner' } });
  const exit = () => { if (onboarding === '1') router.replace({ pathname: '/paywall', params: { onboarding } }); else if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  const result = scan.session.items.find(item => item.cardId === status.cardId);
  const title = status.phase === 'IDENTIFYING' ? 'Identifying…' : status.phase === 'CARD_CANDIDATE' ? 'Hold steady' : status.phase === 'WAITING_FOR_CARD_CHANGE' ? 'Present the next card' : 'Center a card';
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    {focused ? <StatusBar style="light" /> : null}
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close scanner, keep pending cards" onPress={exit} style={styles.icon}><Icon name="close" color={colors.white} size={26} /></Pressable>
      <Label style={styles.heading}>Scanner</Label><Label kind="caption" style={styles.quiet}>CardSight · Test</Label>
      <Pressable accessibilityRole="button" accessibilityLabel="Use demo scanner" onPress={onDemo} style={styles.icon}><Icon name="flask-outline" color={colors.scannerFrame} /></Pressable>
    </View>
    <View style={styles.camera}>
      {liveScannerConfig && connection === 'ready' ? <LiveScannerCamera ref={camera} active={focused && appActive && scan.ready} onError={setCaptureError} /> : <View style={styles.setup}>
        {liveScannerConfig && connection === 'loading' ? <ActivityIndicator color={colors.white} /> : <Icon name="server-outline" color={colors.scannerFrame} size={36} />}<Label kind="heading" style={styles.heading}>{!liveScannerConfig ? 'Connect scanner server' : connection === 'loading' ? 'Connecting scanner…' : 'Scanner unavailable'}</Label>
        <Label style={styles.quiet}>{!liveScannerConfig ? 'Configure the local scanner URL and pairing token, then restart Expo.' : 'The local server must be online with CardSight recognition configured.'}</Label>
        {liveScannerConfig && connection === 'unavailable' ? <Button title="Retry connection" variant="inverse" onPress={() => { setConnection('loading'); setConnectionAttempt(value => value + 1); }} /> : null}
        <Button title="Use demo scanner" variant="inverse" onPress={onDemo} />
      </View>}
      {liveScannerConfig && connection === 'ready' ? <View style={styles.result}>
        {status.phase === 'RESULT_READY' && result ? <RecognitionOverlay item={result} count={scan.summary.copies} /> : <View style={styles.status}>
          {status.phase === 'IDENTIFYING' ? <ActivityIndicator color={colors.white} /> : <Icon name="scan-outline" color={colors.white} size={20} />}
          <Label kind="caption" style={styles.quiet}>{status.phase === 'ERROR' ? status.error : paused ? 'Scanning paused' : !scan.allowed ? 'Free scan used' : title}</Label>
        </View>}
      </View> : null}
    </View>
    <View style={styles.controls}>
      {scan.loadError || scan.error || captureError ? <Label kind="caption" accessibilityRole="alert" style={styles.quiet}>{scan.loadError ?? scan.error ?? captureError}</Label> : null}
      {scan.loadError ? <Button title="Retry pending scans" variant="inverse" onPress={scan.retryLoad} /> : null}
      {liveScannerConfig && connection === 'ready' && scan.allowed ? <View style={styles.row}>
        <View style={{ flex: 1 }}><Button title={paused ? 'Resume scanning' : 'Pause scanning'} variant="inverse" icon={paused ? 'play-outline' : 'pause-outline'} onPress={() => setPaused(value => !value)} /></View>
        {status.phase === 'ERROR' || captureError ? <Button title="Retry" variant="inverse" onPress={() => { setCaptureError(null); controller.retry(); }} /> : null}
      </View> : !scan.allowed ? <Button title="Explore Chase Pro" variant="inverse" onPress={paywall} /> : null}
      <Button title={`Organize (${scan.summary.copies})`} icon="albums-outline" disabled={!scan.ready} onPress={() => router.push({ pathname: '/organize', params: { onboarding } })} />
    </View>
    <Modal transparent visible={Boolean(review)} animationType="fade" onRequestClose={() => chooser.current?.finish()}>
      <View style={styles.scrim}><View style={styles.dialog} accessibilityViewIsModal>
        <Label kind="heading" accessibilityRole="header">Choose the printing</Label>
        <Label kind="caption" style={{ color: colors.muted }}>Confirm the English printing.</Label>
        <ScrollView contentContainerStyle={{ gap: 8 }}>{review?.map(card => <Pressable key={card.id} accessibilityRole="button" accessibilityLabel={`Choose ${card.name}, ${card.setName}, ${card.collectorNumber}`}
          onPress={() => chooser.current?.finish(card)} style={styles.choice}>
          <CardPrint card={card} style={{ width: 45 }} /><View style={{ flex: 1 }}><Label style={{ fontWeight: '600' }}>{card.name}</Label><Label kind="caption" style={{ color: colors.muted }}>{card.setName} · {card.collectorNumber}</Label></View><Icon name="chevron-forward" color={colors.primary} />
        </Pressable>)}</ScrollView>
        <Button title="Cancel identification" variant="secondary" onPress={() => chooser.current?.finish()} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.scanner }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, flexWrap: 'wrap' },
  heading: { color: colors.white, fontWeight: '700', flexShrink: 1 }, quiet: { color: colors.scannerMuted, textAlign: 'center' },
  icon: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  camera: { flex: 1, minHeight: 200, backgroundColor: colors.heroInk }, setup: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  result: { position: 'absolute', bottom: 12, left: 12, right: 12 }, status: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: colors.scanner },
  controls: { padding: 16, gap: 12 }, row: { flexDirection: 'row', gap: 12 },
  scrim: { flex: 1, backgroundColor: colors.scrim, padding: 24, justifyContent: 'center' }, dialog: { backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 16, maxHeight: '85%' },
  choice: { minHeight: 76, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', padding: 8, gap: 12 },
});
