import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, Icon, Label } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { ScannerController } from '@/services/scannerController';
import { LiveCardPresentationTracker } from '@/services/liveCardFrames';
import { LiveScannerPipeline } from '@/services/liveScannerPipeline';
import { ScannerDiagnostics } from '@/services/scannerDiagnostics';
import { CameraCaptureTimeout, CameraSampleError } from '@/services/cameraCapture';
import { isHostedScanner, liveScannerConfig } from '@/services/cardsight/config';
import { scannerHealth } from '@/services/cardsight/gateway';
import { useAuth } from '@/features/account/AuthProvider';
import { colors } from '@/theme/tokens';
import type { Card } from '@/types/domain';
import type { ScannerStatus } from '@/types/scanner';
import { useScanSession } from './ScanSessionProvider';
import { LiveScannerCamera, type LiveCameraHandle } from './LiveScannerCamera';
import { ScannedCardReveal } from './ScannedCardReveal';

export function LiveScannerScreen({ onDemo }: { onDemo: () => void }) {
  const scan = useScanSession();
  const auth = useAuth();
  const userId = auth.user?.id;
  const hosted = isHostedScanner(liveScannerConfig);
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [torchNotice, setTorchNotice] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionCode, setConnectionCode] = useState<string | undefined>();
  const [checkedUser, setCheckedUser] = useState<string | undefined>();
  const [status, setStatus] = useState<ScannerStatus>({ phase: 'SEARCHING', cardId: null, error: null });
  const [review, setReview] = useState<Card[] | null>(null);
  const [activity, setActivity] = useState('recognizing');
  const [diagnosticReport, setDiagnosticReport] = useState<string | null>(null);
  const diagnosticsOpen = useRef(false);
  const [diagnostics] = useState(() => new ScannerDiagnostics());
  const chooser = useRef<{ finish: (card?: Card) => void } | null>(null);
  const camera = useRef<LiveCameraHandle>(null);
  const captureFailures = useRef(0);
  const captureRetryAt = useRef(0);
  const allowed = useRef(scan.allowed);
  useEffect(() => { allowed.current = scan.allowed; }, [scan.allowed]);
  const [tracker] = useState(() => new LiveCardPresentationTracker());
  const [controller] = useState(() => new ScannerController(async () => { throw new Error('Scanner is loading.'); }, status => {
    diagnostics.record('state', { phase: status.phase }); setStatus(status);
  }));
  const [pipeline] = useState(() => new LiveScannerPipeline(controller, tracker, () => false));
  useEffect(() => { pipeline.setAllowed(() => allowed.current && !chooser.current && !diagnosticsOpen.current); }, [pipeline]);
  const onStage = useCallback((stage: string) => { diagnostics.record(stage); setActivity(stage); }, [diagnostics]);
  const chooseCandidate = useCallback((cards: Card[], signal?: AbortSignal) => new Promise<Card>((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Recognition canceled.')); return; }
    const cancel = () => finish();
    const finish = (card?: Card) => { signal?.removeEventListener('abort', cancel); chooser.current = null; setReview(null); if (card) resolve(card); else reject(new Error('Printing selection canceled. Present the next card.')); };
    chooser.current = { finish }; setReview(cards);
    signal?.addEventListener('abort', cancel, { once: true });
  }), []);
  useEffect(() => { controller.setRecognizer((frame, signal) => scan.identify(frame, signal, {
    mode: 'live', chooseCandidate, onStage, shouldStage: id => controller.shouldStageResult(frame, id),
    heldCardId: () => controller.heldCardId, onCommitted: id => controller.acknowledgeCommitted(frame, id),
  })); });
  useEffect(() => { const subscription = AppState.addEventListener('change', value => setAppActive(value === 'active')); return () => subscription.remove(); }, []);
  useEffect(() => {
    if (!liveScannerConfig || !focused || !appActive) return;
    if (hosted && !userId) return;
    const abort = new AbortController();
    let stopped = false;
    const timer = setTimeout(() => { abort.abort(); if (!stopped) setConnection('unavailable'); }, 8000);
    void scannerHealth(abort.signal).then(value => {
      if (!stopped) { setCheckedUser(userId); setConnectionCode(value.code); setConnection(value.ready ? 'ready' : 'unavailable'); }
    }).catch(() => { if (!stopped) { setConnectionCode(undefined); setConnection('unavailable'); } }).finally(() => clearTimeout(timer));
    return () => { stopped = true; clearTimeout(timer); abort.abort(); };
  }, [focused, appActive, connectionAttempt, hosted, userId]);
  const connected = connection === 'ready' && (!hosted || Boolean(userId && userId === checkedUser));
  const needsSignIn = hosted && auth.ready && (!userId || (checkedUser === userId && connectionCode === 'login_required'));
  const active = focused && appActive && scan.ready && !scan.loadError && connected && Boolean(liveScannerConfig);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    diagnostics.record('sampling-start');
    pipeline.start();
    const clock = setInterval(() => controller.tick(Date.now()), 200);
    captureFailures.current = 0; captureRetryAt.current = 0;
    const tick = async () => {
      if (stopped) return;
      const sampleStarted = Date.now();
      if (Date.now() >= captureRetryAt.current) {
        try {
          const captured = await pipeline.sample(async shouldUpload => camera.current?.capture(shouldUpload));
          if (stopped) return;
          if (captured) {
            captureFailures.current = 0;
            setCaptureError(null);
            diagnostics.record('sample', { ...captured.timings, uploaded: Boolean(captured.image), ...tracker.diagnostic });
          }
        } catch (cause) { if (!stopped) {
          tracker.resetCandidates(); captureFailures.current++;
          diagnostics.record('capture-recovery', { failures: captureFailures.current,
            reason: cause instanceof CameraCaptureTimeout ? 'timeout' : cause instanceof CameraSampleError ? cause.stage : 'unknown' });
          captureRetryAt.current = Date.now() + Math.min(8000, 1000 * 2 ** Math.min(captureFailures.current, 3));
          tracker.settleLighting(Date.now()); setTorch(false); camera.current?.restart();
          setCaptureError('Reconnecting camera…');
        } }
      }
      if (!stopped) timer = setTimeout(() => { void tick(); }, Math.max(150, 650 - (Date.now() - sampleStarted)));
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); clearInterval(clock); pipeline.stop(); diagnostics.record('sampling-stop'); };
  }, [active, controller, tracker, pipeline, diagnostics]);
  useEffect(() => () => { controller.dispose(); chooser.current?.finish(); }, [controller]);
  const paywall = () => router.push({ pathname: '/paywall', params: { returnTo: 'scanner' } });
  const exit = () => { if (onboarding === '1') router.replace({ pathname: '/paywall', params: { onboarding } }); else if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  const result = scan.session.items.find(item => item.cardId === status.cardId);
  const pendingResult = scan.session.unresolved?.find(item => `pending:${item.id}` === status.cardId);
  const title = status.phase === 'IDENTIFYING' ? activity === 'catalog' ? 'Matching printing…' : activity === 'saving' ? 'Saving scan…' : 'Identifying…' : status.phase === 'CARD_CANDIDATE' ? 'Hold steady' : status.phase === 'WAITING_FOR_CARD_CHANGE' ? 'Present the next card' : 'Center a card';
  const onCameraError = useCallback((message: string) => { diagnostics.record('camera-error'); tracker.settleLighting(Date.now()); setTorch(false); setCaptureError(message); }, [tracker, diagnostics]);
  const onCameraReadyChange = useCallback((ready: boolean) => {
    diagnostics.record('camera-ready', { ready });
    setCameraReady(ready);
    if (!ready) { tracker.settleLighting(Date.now()); setTorch(false); }
  }, [tracker, diagnostics]);
  useEffect(() => {
    if (!torchNotice) return;
    const timer = setTimeout(() => setTorchNotice(null), 2400);
    return () => clearTimeout(timer);
  }, [torchNotice]);
  const toggleTorch = () => {
    if (Platform.OS === 'web') { setTorchNotice('Flashlight is available in the Android and iOS app.'); return; }
    tracker.settleLighting(Date.now());
    setTorch(value => !value);
  };
  const openDiagnostics = () => { diagnosticsOpen.current = true; setDiagnosticReport(diagnostics.report()); };
  const closeDiagnostics = () => { diagnosticsOpen.current = false; setDiagnosticReport(null); };
  const scanningMessage = captureError ?? (status.phase === 'ERROR' ? status.error : !scan.allowed ? 'Free scan used' : title);
  const connectionMessage = !hosted ? (!liveScannerConfig ? 'Configure the local scanner URL and pairing token, then restart Expo.' : 'The local server must be online with CardSight recognition configured.')
    : needsSignIn ? 'Sign in to use the online scanner. Your pending cards stay on this device.'
      : connectionCode === 'access_required' ? 'Online scanning access has not been enabled for this account.'
        : connectionCode === 'account_limit' ? 'Your online scanner test allowance has been reached.'
          : connectionCode === 'service_limit' ? 'The online scanner has reached its daily test limit.'
            : connection === 'loading' ? 'Checking your online scanner access.' : 'The online scanner is unavailable. Try connecting again.';
  return <View style={styles.screen}>
    {focused ? <StatusBar style="light" /> : null}
    <View style={StyleSheet.absoluteFill} testID="live-scanner-preview">
      {liveScannerConfig && connected ? <LiveScannerCamera ref={camera} active={focused && appActive && scan.ready && !scan.loadError}
        torch={torch && focused && appActive} onReadyChange={onCameraReadyChange} onError={onCameraError} /> : <View style={[styles.setup, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 96 }]}>
        {liveScannerConfig && connection === 'loading' && !needsSignIn ? <ActivityIndicator color={colors.white} /> : <Icon name="server-outline" color={colors.scannerFrame} size={36} />}<Label kind="heading" style={styles.heading}>{needsSignIn ? 'Sign in to scan' : !liveScannerConfig ? 'Connect scanner server' : connection === 'loading' ? 'Connecting scanner…' : 'Scanner unavailable'}</Label>
        <Label style={styles.quiet}>{connectionMessage}</Label>
        {needsSignIn ? <Button title="Sign In" variant="inverse" onPress={() => router.push({ pathname: '/account', params: { section: 'signin' } })} /> : null}
        {liveScannerConfig && connection === 'unavailable' && !needsSignIn ? <Button title="Retry connection" variant="inverse" onPress={() => { setConnection('loading'); setConnectionAttempt(value => value + 1); }} /> : null}
        <Button title="Use demo scanner" variant="inverse" onPress={onDemo} />
      </View>}
    </View>
    <View pointerEvents="box-none" style={[styles.header, { top: insets.top + 8, left: insets.left + 16, right: insets.right + 16 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close scanner, keep pending cards" onPress={exit} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}><Icon name="close" color={colors.white} size={26} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'}
        accessibilityState={{ selected: torch, disabled: !cameraReady }} disabled={!cameraReady} onPress={toggleTorch}
        style={({ pressed }) => [styles.icon, styles.torch, torch && styles.torchOn, !cameraReady && styles.disabled, pressed && styles.pressed]}>
        <Icon name={torch ? 'flash' : 'flash-off-outline'} color={torch ? colors.primary : colors.white} size={24} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Use demo scanner" onPress={onDemo} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}><Icon name="flask-outline" color={colors.scannerFrame} /></Pressable>
    </View>
    <View pointerEvents="box-none" style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16), paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      {liveScannerConfig && connected ? <View pointerEvents="box-none" style={styles.feedback}>
        {status.phase === 'RESULT_READY' && result ? <ScannedCardReveal key={status.cardId} item={result} count={scan.summary.copies} />
          : <Pressable style={styles.status} accessibilityRole={__DEV__ ? 'button' : undefined} accessibilityLabel={__DEV__ ? `${scanningMessage}. Show scanner diagnostics` : undefined} onPress={__DEV__ ? openDiagnostics : undefined} accessibilityLiveRegion="polite">
            {status.phase === 'IDENTIFYING' ? <ActivityIndicator color={colors.white} /> : <Icon name={status.phase === 'ERROR' || captureError ? 'alert-circle-outline' : 'scan-outline'} color={colors.white} size={18} />}
            <Label kind="caption" style={styles.statusText}>{status.phase === 'RESULT_READY' && pendingResult ? `${pendingResult.recognition.candidates[0]?.name ?? 'Card recognized'} · Match printing in Organize` : scanningMessage}</Label>
            {__DEV__ ? <Icon name="information-circle-outline" color={colors.scannerMuted} size={18} /> : null}
          </Pressable>}
      </View> : null}
      {torchNotice ? <Label kind="caption" accessibilityLiveRegion="polite" style={styles.notice}>{torchNotice}</Label> : null}
      {scan.loadError || scan.error ? <Label kind="caption" accessibilityRole="alert" style={styles.notice}>{scan.loadError ?? scan.error}</Label> : null}
      {scan.loadError ? <Button title="Retry pending scans" variant="inverse" onPress={scan.retryLoad} /> : null}
      {!scan.allowed ? <Button title="Explore Chase Pro" variant="inverse" onPress={paywall} /> : null}
      <Button title={`Organize (${scan.summary.copies})`} icon="albums-outline" disabled={!scan.ready} onPress={() => router.push({ pathname: '/organize', params: { onboarding } })} />
    </View>
    <Modal transparent visible={diagnosticReport !== null} animationType="fade" onRequestClose={closeDiagnostics}>
      <View style={styles.scrim}><View style={styles.dialog} accessibilityViewIsModal>
        <Label kind="heading">Scanner diagnostics</Label>
        <ScrollView><Label selectable kind="caption">{diagnosticReport}</Label></ScrollView>
        <Button title="Refresh diagnostics" variant="secondary" onPress={() => setDiagnosticReport(diagnostics.report())} />
        <Button title="Close diagnostics" onPress={closeDiagnostics} />
      </View></View>
    </Modal>
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
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.heroInk },
  header: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: colors.white, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  quiet: { color: colors.scannerMuted, textAlign: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.scanner },
  torch: { position: 'absolute', left: '50%', marginLeft: -24 },
  torchOn: { backgroundColor: colors.primarySoft }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.75 },
  setup: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 16 },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, gap: 12, paddingTop: 12 },
  feedback: { alignItems: 'center', marginBottom: 4 },
  status: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.scanner, maxWidth: '100%' },
  statusText: { color: colors.white, textAlign: 'center', flexShrink: 1 },
  notice: { color: colors.white, textAlign: 'center', padding: 10, backgroundColor: colors.scanner, borderRadius: 12 },
  scrim: { flex: 1, backgroundColor: colors.scrim, padding: 24, justifyContent: 'center' }, dialog: { backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 16, maxHeight: '85%' },
  choice: { minHeight: 76, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', padding: 8, gap: 12 },
});
