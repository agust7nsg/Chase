import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
/** Preview only: no capture, upload, or real recognition in Phase A. */
export function ScannerCamera({ active, onVisible }: { active: boolean; onVisible: (visible: boolean) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visible = active && enabled && !!permission?.granted && !error;
  useEffect(() => { onVisible(visible); }, [onVisible, visible]);
  const enable = async () => {
    try {
      setError(null);
      if (!permission?.granted && !(await requestPermission()).granted) { setError('Camera unavailable. The demo still works.'); return; }
      setEnabled(true);
    } catch { setError('Camera unavailable. The demo still works.'); }
  };
  return <>
    {visible ? <CameraView style={StyleSheet.absoluteFill} facing="back" mode="picture" onMountError={() => { setError('Camera unavailable. The demo still works.'); setEnabled(false); }} /> : null}
    {!visible ? <View style={styles.permission}>
      {error ? <Label kind="caption" style={styles.label}>{error}</Label> : null}
      {permission?.canAskAgain === false && !permission.granted && Platform.OS !== 'web'
        ? <Button title="Camera settings" variant="inverse" onPress={() => { void Linking.openSettings(); }} />
        : <Button title="Enable camera preview" variant="inverse" onPress={() => { void enable(); }} />}
    </View> : null}
  </>;
}
const styles = StyleSheet.create({
  permission: { position: 'absolute', top: 12, left: 20, right: 20, alignItems: 'center', gap: 8, zIndex: 2 },
  label: { color: colors.white, textAlign: 'center' },
});
