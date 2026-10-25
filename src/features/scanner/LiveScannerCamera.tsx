import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { decode } from 'jpeg-js';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { analyzeCardPixels, type CardPixelObservation } from '@/services/liveCardFrames';
import { scannerCrop, scannerGuide, thumbnailBytes } from '@/services/scannerImages';
import { CameraCaptureGate, CameraCaptureTimeout, CameraSampleDeadline, CameraSampleError, cameraDeadline, scannerPictureSize, selectiveCameraSample } from '@/services/cameraCapture';
import { CameraPreviewLayout, type CameraPreviewSnapshot } from '@/services/cameraPreviewLayout';
import type { RecognitionImage } from '@/services/contracts';

export type LiveCameraCapture = { image?: RecognitionImage; observation: CardPixelObservation;
  timings: { captureMs: number; analysisMs: number; uploadMs: number; totalMs: number } };
type ShouldUpload = (observation: CardPixelObservation) => boolean;
type PreviewDiagnostic = Record<string, number | string | boolean | null>;
export interface LiveCameraHandle { capture(shouldUpload: ShouldUpload): Promise<LiveCameraCapture | undefined>; restart(): void; preview(): PreviewDiagnostic }
interface SurfaceHandle { capture(shouldUpload: ShouldUpload): Promise<LiveCameraCapture | undefined>; preview(): PreviewDiagnostic }
// Reuse only the back-camera configuration, never its native view/ref/busy state.
let preferredSize: string | undefined;
let configurationKnown = false;

export const LiveScannerCamera = forwardRef<LiveCameraHandle, { active: boolean; torch: boolean; onReadyChange: (ready: boolean) => void; onError: (message: string) => void }>(function LiveScannerCamera({ active, torch, onReadyChange, onError }, ref) {
  const [permission, requestPermission] = useCameraPermissions();
  const [enabled, setEnabled] = useState(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [epoch, setEpoch] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const mountFailures = useRef(0);
  const [configuration, setConfiguration] = useState({ phase: configurationKnown ? 'ready' : 'discover', size: preferredSize });
  const surface = useRef<SurfaceHandle>(null);
  const sequence = useRef(0);
  const owner = useRef<number | null>(null);
  const [mount, setMount] = useState<{ id: number; epoch: number; phase: string; bounds: { width: number; height: number } } | null>(null);
  const visible = Boolean(active && enabled && permission?.granted);
  const canMount = visible && !recovering && bounds.width > 0 && bounds.height > 0 && configuration.phase !== 'release';
  const currentMount = canMount && mount?.epoch === epoch && mount.phase === configuration.phase
    && mount.bounds.width === bounds.width && mount.bounds.height === bounds.height ? mount : null;
  owner.current = currentMount?.id ?? null;
  useEffect(() => {
    onReadyChange(false);
    setMount(null);
    if (!canMount) return;
    // Commit removal of the previous native view and let the final screen bounds
    // settle before creating another CameraX owner. Never remount on every layout tick.
    const timer = setTimeout(() => setMount({ id: ++sequence.current, epoch, phase: configuration.phase, bounds }), 100);
    return () => clearTimeout(timer);
  }, [canMount, bounds, epoch, configuration.phase, onReadyChange]);
  useEffect(() => { if (!visible) onReadyChange(false); }, [visible, onReadyChange]);
  useEffect(() => {
    if (!recovering || !visible) return;
    const timer = setTimeout(() => { setEpoch(value => value + 1); setRecovering(false); }, Math.min(8000, 1000 * 2 ** Math.min(mountFailures.current, 3)));
    return () => clearTimeout(timer);
  }, [recovering, visible]);
  const readyChanged = useCallback((ready: boolean) => {
    if (ready) mountFailures.current = 0;
    onReadyChange(ready);
  }, [onReadyChange]);
  useEffect(() => {
    if (configuration.phase !== 'release') return;
    const timer = setTimeout(() => setConfiguration(value => ({ ...value, phase: 'ready' })), 100);
    return () => clearTimeout(timer);
  }, [configuration.phase]);
  useImperativeHandle(ref, () => ({ capture: async shouldUpload => surface.current?.capture(shouldUpload), restart: () => setEpoch(value => value + 1),
    preview: () => ({ mount: owner.current, ...(surface.current?.preview() ?? { phase: 'settling', width: bounds.width, height: bounds.height }) }) }), [bounds]);
  const enable = async () => {
    try {
      if (!permission?.granted && !(await requestPermission()).granted) { onError('Camera permission is required for real scanning.'); return; }
      setEnabled(true);
    } catch { onError('Camera could not be opened. Try again.'); }
  };
  const guide = scannerGuide(bounds.width, bounds.height);
  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setBounds(previous => previous.width === width && previous.height === height ? previous : { width, height });
  }}>
    {currentMount ? <CameraSurface
      key={currentMount.id} ref={surface} bounds={currentMount.bounds}
      configured={configuration.phase === 'ready'} pictureSize={configuration.size} torch={torch && visible}
      onReadyChange={ready => { if (owner.current === currentMount.id) readyChanged(ready); }}
      onConfigured={size => { if (owner.current !== currentMount.id) return; preferredSize = size; configurationKnown = true; setConfiguration({ phase: 'release', size }); }}
      onError={() => { if (owner.current !== currentMount.id) return; mountFailures.current++; setRecovering(true); onError('Camera interrupted. Reconnecting…'); }} /> : visible ? <View style={styles.opening}><ActivityIndicator color={colors.white} /></View> : null}
    {visible ? <View pointerEvents="none" style={styles.guideArea}><View style={{ width: guide.width, height: guide.height }}>
      {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => <View key={corner} style={[styles.corner, styles[corner]]} />)}
    </View></View> : enabled && permission?.granted ? <View style={styles.opening}><ActivityIndicator color={colors.white} /></View> : <View style={styles.permission}>
      <Label style={styles.disclosure}>Card photos are sent to CardSight for identification.</Label>
      {permission?.canAskAgain === false && !permission.granted && Platform.OS !== 'web'
        ? <Button title="Camera settings" variant="inverse" onPress={() => { void Linking.openSettings(); }} />
        : <Button title="Enable card scanning" variant="inverse" onPress={() => { void enable(); }} />}
    </View>}
  </View>;
});

const CameraSurface = forwardRef<SurfaceHandle, { bounds: { width: number; height: number }; pictureSize?: string; configured: boolean; torch: boolean;
  onReadyChange: (ready: boolean) => void; onConfigured: (size?: string) => void; onError: (message: string) => void }>(function CameraSurface({ bounds, pictureSize, configured, torch, onReadyChange, onConfigured, onError }, ref) {
  const camera = useRef<CameraView>(null);
  const [gate] = useState(() => new CameraCaptureGate());
  const alive = useRef(true);
  const discovering = useRef(false);
  const callbacks = useRef({ onReadyChange, onConfigured, onError });
  callbacks.current = { onReadyChange, onConfigured, onError };
  const [previewLayout] = useState(() => new CameraPreviewLayout(bounds, Platform.OS === 'android'));
  const [geometry, setGeometry] = useState(previewLayout.snapshot);
  const measured = useRef({ width: 0, height: 0 });
  const readinessFrame = useRef<number | null>(null);
  const readyNotified = useRef(false);
  const failed = useRef(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const publishGeometry = (next: CameraPreviewSnapshot) => {
    if (!alive.current || failed.current) return;
    setGeometry(next);
    if (!next.ready || readyNotified.current || readinessFrame.current !== null) return;
    // CameraState.OPEN precedes PreviewView layout. Even after the measured
    // Android reflow, allow its restored surface transform to reach the renderer.
    readinessFrame.current = requestAnimationFrame(() => {
      readinessFrame.current = requestAnimationFrame(() => {
        readinessFrame.current = null;
        if (!alive.current || failed.current || !previewLayout.snapshot.ready) return;
        readyNotified.current = true; setPreviewVisible(true); gate.markReady(); callbacks.current.onReadyChange(true);
      });
    });
  };
  const failSurface = (message: string) => {
    if (!alive.current || failed.current) return;
    failed.current = true; gate.retire();
    if (readinessFrame.current !== null) cancelAnimationFrame(readinessFrame.current);
    readinessFrame.current = null;
    callbacks.current.onReadyChange(false); callbacks.current.onError(message);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; gate.retire();
      // React StrictMode replays effects on the same component instance. The
      // alive/owner guards retire callbacks without poisoning its layout handshake.
      if (readinessFrame.current !== null) cancelAnimationFrame(readinessFrame.current);
      readinessFrame.current = null;
      callbacks.current.onReadyChange(false);
    };
  }, [gate, previewLayout]);
  useEffect(() => {
    if (!configured || geometry.ready) return;
    const timer = setTimeout(() => {
      if (!alive.current || readyNotified.current) return;
      failSurface('Camera preview did not finish opening.');
    }, 7000);
    return () => clearTimeout(timer);
    // failSurface uses mount-owned refs and current callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, geometry.ready]);
  useImperativeHandle(ref, () => ({ preview: () => ({ phase: previewLayout.snapshot.phase, width: previewLayout.snapshot.width, height: previewLayout.snapshot.height,
    measuredWidth: measured.current.width, measuredHeight: measured.current.height, captureReady: alive.current && readyNotified.current && !failed.current }), capture: async shouldUpload => {
    const native = camera.current;
    if (!native) return;
    const lease = gate.begin();
    if (lease === undefined) return;
    const started = Date.now();
    const deadline = new CameraSampleDeadline();
    const operation = async (): Promise<LiveCameraCapture | undefined> => {
      const files: string[] = [];
      const contexts: { release(): void }[] = [];
      let result: LiveCameraCapture | undefined;
      let stage: 'capture' | 'analysis' | 'upload' = 'capture';
      try {
        const photo = await native.takePictureAsync({ quality: 0.8, exif: false, skipProcessing: false });
        files.push(photo.uri);
        if (!alive.current || !gate.current(lease)) return;
        const captureMs = Date.now() - started;
        const crop = scannerCrop(photo, bounds);
        const current = () => alive.current && gate.current(lease);
        const sample = await selectiveCameraSample({
          current, shouldUpload, onUpload: () => deadline.allowUpload(),
          analyze: async () => {
            stage = 'analysis';
            // Keep ordinary sampling small. A held card/background must not create
            // a 768px JPEG and base64 string just to decide that no request is due.
            const context = ImageManipulator.manipulate(photo.uri); contexts.push(context);
            context.crop(crop).resize({ width: 64, height: 88 });
            const small = await context.renderAsync(); contexts.push(small);
            if (!current()) throw new Error('Camera sample canceled.');
            const thumb = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true }); files.push(thumb.uri);
            if (!thumb.base64) throw new Error('Camera thumbnail unavailable.');
            const pixels = decode(thumbnailBytes(thumb.base64), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 0.01, maxMemoryUsageInMB: 8 });
            return analyzeCardPixels(pixels);
          },
          encode: async (): Promise<RecognitionImage> => {
            stage = 'upload';
            const context = ImageManipulator.manipulate(photo.uri); contexts.push(context);
            context.crop(crop).resize({ width: 768 });
            const image = await context.renderAsync(); contexts.push(image);
            if (!current()) throw new Error('Camera sample canceled.');
            const upload = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true }); files.push(upload.uri);
            if (!upload.base64) throw new Error('Camera image unavailable.');
            return { base64: upload.base64, mimeType: 'image/jpeg', width: upload.width, height: upload.height };
          },
        });
        if (!sample) return;
        result = { observation: sample.observation, ...(sample.image ? { image: sample.image } : {}),
          timings: { captureMs, analysisMs: sample.analysisMs, uploadMs: sample.uploadMs, totalMs: 0 } };
      } catch (cause) {
        if (cause instanceof CameraCaptureTimeout) throw cause;
        throw new CameraSampleError(stage);
      } finally {
        for (const context of contexts.reverse()) { try { context.release(); } catch { /* Already released. */ } }
        for (const uri of files) if (uri.startsWith('file://')) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache cleanup can finish later. */ } }
      }
      result.timings.totalMs = Date.now() - started;
      return result;
    };
    try { return await deadline.run(operation()); }
    catch (cause) { if (cause instanceof CameraCaptureTimeout) gate.retire(); if (alive.current) throw cause; }
    finally { gate.end(lease); }
  } }), [bounds, gate, previewLayout]);
  return <View testID="live-camera-surface" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
    onLayout={Platform.OS === 'web' ? event => { if (!alive.current) return; const { width, height } = event.nativeEvent.layout; measured.current = { width, height }; publishGeometry(previewLayout.layout(width, height)); } : undefined}>
    <CameraView ref={camera} style={{ width: geometry.width, height: geometry.height }}
    onLayout={event => { if (!alive.current) return; const { width, height } = event.nativeEvent.layout; measured.current = { width, height }; publishGeometry(previewLayout.layout(width, height)); }} facing="back" mode="picture" autofocus="on"
    pictureSize={pictureSize} animateShutter={false} enableTorch={torch && geometry.ready}
    onMountError={() => failSurface('Camera unavailable. Reopen it or use the demo scanner.')}
    onCameraReady={() => {
      if (!alive.current || failed.current) return;
      if (configured) { publishGeometry(previewLayout.cameraReady()); return; }
      if (discovering.current) return;
      discovering.current = true;
      void cameraDeadline(camera.current!.getAvailablePictureSizesAsync()).then(sizes => {
        if (alive.current) callbacks.current.onConfigured(scannerPictureSize(sizes));
      }).catch(() => { if (alive.current) callbacks.current.onConfigured(undefined); });
    }} />
    {!previewVisible ? <View pointerEvents="none" style={styles.opening} testID="camera-preview-settling"><ActivityIndicator color={colors.white} /><Label style={styles.disclosure}>Opening camera…</Label></View> : null}
  </View>;
});
const styles = StyleSheet.create({
  opening: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.heroInk, justifyContent: 'center', alignItems: 'center', gap: 12 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  disclosure: { color: colors.white, textAlign: 'center' },
  guideArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.scannerFrame },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 10 },
});
