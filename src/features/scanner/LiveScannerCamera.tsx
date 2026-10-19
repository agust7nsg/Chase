import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { decode } from 'jpeg-js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { analyzeCardPixels, type CardPixelObservation } from '@/services/liveCardFrames';
import { scannerCrop, scannerGuide, thumbnailBytes } from '@/services/scannerImages';
import type { RecognitionImage } from '@/services/contracts';

export interface LiveCameraHandle {
  capture(): Promise<{ image: RecognitionImage; observation: CardPixelObservation } | undefined>;
}

/** Only small derived pixels stay in memory; native camera/manipulator cache files are deleted after every capture. */
export const LiveScannerCamera = forwardRef<LiveCameraHandle, { active: boolean; onError: (message: string) => void }>(function LiveScannerCamera({ active, onError }, ref) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<string>();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const captureBusy = useRef(false);
  const visible = active && enabled && permission?.granted;
  useEffect(() => { if (!visible) setReady(false); }, [visible]);
  useImperativeHandle(ref, () => ({ capture: async () => {
    if (!visible || !ready || !camera.current || captureBusy.current || !bounds.width) return;
    captureBusy.current = true;
    const files: string[] = [];
    const contexts: { release(): void }[] = [];
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, exif: false, skipProcessing: false });
      files.push(photo.uri);
      const context = ImageManipulator.manipulate(photo.uri); contexts.push(context);
      context.crop(scannerCrop(photo, bounds)).resize({ width: 768 });
      const image = await context.renderAsync(); contexts.push(image);
      const upload = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true }); files.push(upload.uri);
      const smallContext = ImageManipulator.manipulate(image); contexts.push(smallContext);
      smallContext.resize({ width: 64, height: 88 });
      const small = await smallContext.renderAsync(); contexts.push(small);
      const thumb = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true }); files.push(thumb.uri);
      if (!upload.base64 || !thumb.base64) throw new Error('Camera image unavailable.');
      const pixels = decode(thumbnailBytes(thumb.base64), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 0.01, maxMemoryUsageInMB: 8 });
      return { image: { base64: upload.base64, mimeType: 'image/jpeg', width: upload.width, height: upload.height }, observation: analyzeCardPixels(pixels) };
    } finally {
      for (const context of contexts.reverse()) { try { context.release(); } catch { /* Already released native object. */ } }
      for (const uri of files) if (uri.startsWith('file://')) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache cleanup can complete after a file is no longer accessible. */ } }
      captureBusy.current = false;
    }
  } }), [visible, ready, bounds]);
  const enable = async () => {
    try { if (!permission?.granted && !(await requestPermission()).granted) { onError('Camera permission is required for real scanning.'); return; } setReady(false); setEnabled(true); }
    catch { onError('Camera could not be opened. Try again.'); }
  };
  const guide = scannerGuide(bounds.width, bounds.height);
  return <View style={StyleSheet.absoluteFill} onLayout={event => setBounds(event.nativeEvent.layout)}>
    {visible ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" autofocus="on" pictureSize={size} animateShutter={false}
      onMountError={() => { setReady(false); setEnabled(false); onError('Camera unavailable. Reopen it or use the demo scanner.'); }}
      onCameraReady={() => { setReady(true); void camera.current?.getAvailablePictureSizesAsync().then(sizes => {
        const candidates = sizes.map(value => ({ value, area: value.split('x').map(Number).reduce((a, b) => a * b, 1) })).filter(item => Number.isFinite(item.area) && item.area >= 1280 * 720).sort((a, b) => a.area - b.area);
        if (candidates[0]) setSize(candidates[0].value);
      }).catch(() => {}); }} /> : null}
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
