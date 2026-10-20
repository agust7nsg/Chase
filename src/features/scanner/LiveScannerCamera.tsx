import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { decode } from 'jpeg-js';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { analyzeCardPixels, type CardPixelObservation } from '@/services/liveCardFrames';
import { scannerCrop, scannerGuide, thumbnailBytes } from '@/services/scannerImages';
import { CameraCaptureGate, CameraCaptureTimeout, cameraDeadline, scannerPictureSize } from '@/services/cameraCapture';
import type { RecognitionImage } from '@/services/contracts';

type Capture = { image: RecognitionImage; observation: CardPixelObservation };
export interface LiveCameraHandle { capture(): Promise<Capture | undefined>; restart(): void }
interface SurfaceHandle { capture(): Promise<Capture | undefined> }
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
  const visible = active && enabled && permission?.granted;
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
  useImperativeHandle(ref, () => ({ capture: async () => surface.current?.capture(), restart: () => setEpoch(value => value + 1) }), []);
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
    {visible && !recovering && bounds.width > 0 && bounds.height > 0 && configuration.phase !== 'release' ? <CameraSurface
      key={epoch + ':' + configuration.phase + ':' + bounds.width + ':' + bounds.height} ref={surface} bounds={bounds}
      configured={configuration.phase === 'ready'} pictureSize={configuration.size} torch={torch && Boolean(visible)} onReadyChange={readyChanged}
      onConfigured={size => { preferredSize = size; configurationKnown = true; setConfiguration({ phase: 'release', size }); }}
      onError={() => { mountFailures.current++; setRecovering(true); onError('Camera interrupted. Reconnecting…'); }} /> : null}
    {visible ? <View pointerEvents="none" style={styles.guideArea}><View style={{ width: guide.width, height: guide.height }}>
      {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => <View key={corner} style={[styles.corner, styles[corner]]} />)}
    </View></View> : <View style={styles.permission}>
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
  useEffect(() => { alive.current = true; return () => { alive.current = false; gate.retire(); onReadyChange(false); }; }, [gate, onReadyChange]);
  useImperativeHandle(ref, () => ({ capture: async () => {
    const native = camera.current;
    if (!native) return;
    const lease = gate.begin();
    if (lease === undefined) return;
    const operation = async (): Promise<Capture | undefined> => {
      const files: string[] = [];
      const contexts: { release(): void }[] = [];
      try {
        const photo = await native.takePictureAsync({ quality: 0.8, exif: false, skipProcessing: false });
        files.push(photo.uri);
        if (!alive.current || !gate.current(lease)) return;
        const context = ImageManipulator.manipulate(photo.uri); contexts.push(context);
        context.crop(scannerCrop(photo, bounds)).resize({ width: 768 });
        const image = await context.renderAsync(); contexts.push(image);
        if (!alive.current || !gate.current(lease)) return;
        const upload = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true }); files.push(upload.uri);
        const smallContext = ImageManipulator.manipulate(image); contexts.push(smallContext);
        smallContext.resize({ width: 64, height: 88 });
        const small = await smallContext.renderAsync(); contexts.push(small);
        const thumb = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true }); files.push(thumb.uri);
        if (!alive.current || !gate.current(lease)) return;
        if (!upload.base64 || !thumb.base64) throw new Error('Camera image unavailable.');
        const pixels = decode(thumbnailBytes(thumb.base64), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 0.01, maxMemoryUsageInMB: 8 });
        return { image: { base64: upload.base64, mimeType: 'image/jpeg', width: upload.width, height: upload.height }, observation: analyzeCardPixels(pixels) };
      } finally {
        for (const context of contexts.reverse()) { try { context.release(); } catch { /* Already released. */ } }
        for (const uri of files) if (uri.startsWith('file://')) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache cleanup can finish later. */ } }
      }
    };
    try { return await cameraDeadline(operation()); }
    catch (cause) { if (cause instanceof CameraCaptureTimeout) gate.retire(); if (alive.current) throw cause; }
    finally { gate.end(lease); }
  } }), [bounds, gate]);
  return <CameraView ref={camera} style={{ width: bounds.width, height: bounds.height }} facing="back" mode="picture" autofocus="on"
    pictureSize={pictureSize} animateShutter={false} enableTorch={torch}
    onMountError={() => { gate.retire(); if (alive.current) onError('Camera unavailable. Reopen it or use the demo scanner.'); }}
    onCameraReady={() => {
      if (!alive.current) return;
      if (configured) { gate.markReady(); onReadyChange(true); return; }
      if (discovering.current) return;
      discovering.current = true;
      void cameraDeadline(camera.current!.getAvailablePictureSizesAsync()).then(sizes => {
        if (alive.current) onConfigured(scannerPictureSize(sizes));
      }).catch(() => { if (alive.current) onConfigured(undefined); });
    }} />;
});
const styles = StyleSheet.create({
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  disclosure: { color: colors.white, textAlign: 'center' },
  guideArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.scannerFrame },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 10 },
});
