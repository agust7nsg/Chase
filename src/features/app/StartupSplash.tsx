import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Label } from '@/components/ui';
import { colors } from '@/theme/tokens';

// Hold the native background only until the custom splash has actually laid out.
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => {});
const hideNative = () => { if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => {}); };

/** Local, once-per-root animation. No images, network or scanner work required. */
export function StartupSplash({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const [laidOut, setLaidOut] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));
  const reduced = useRef(true);
  useEffect(() => {
    const release = setTimeout(() => setExpired(true), 2800);
    // Interrupted animations or readiness must never trap the user behind branding.
    const safety = setTimeout(() => { hideNative(); onFinished(); }, 4000);
    return () => { clearTimeout(release); clearTimeout(safety); };
  }, [onFinished]);
  useEffect(() => {
    if (!laidOut) return;
    hideNative();
    let active = true;
    let motionDisabled = false;
    let animation: Animated.CompositeAnimation | undefined;
    let preferenceTimer: ReturnType<typeof setTimeout> | undefined;
    const complete = () => { if (active) setIntroDone(true); };
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      if (enabled) { motionDisabled = true; reduced.current = true; animation?.stop(); progress.setValue(1); complete(); }
    });
    void Promise.race([AccessibilityInfo.isReduceMotionEnabled(), new Promise<boolean>(resolve => {
      preferenceTimer = setTimeout(() => resolve(true), 200);
    })]).catch(() => true).then(reduce => {
      if (preferenceTimer) clearTimeout(preferenceTimer);
      if (!active) return;
      reduced.current = reduce || motionDisabled;
      if (reduced.current) { progress.setValue(1); preferenceTimer = setTimeout(complete, 180); return; }
      progress.setValue(0);
      animation = Animated.timing(progress, { toValue: 1, duration: 1150, easing: Easing.linear, useNativeDriver: true });
      animation.start(({ finished }) => { if (finished) complete(); });
    });
    return () => { active = false; listener.remove(); if (preferenceTimer) clearTimeout(preferenceTimer); animation?.stop(); };
  }, [laidOut, progress]);
  useEffect(() => {
    if (!introDone || (!ready && !expired)) return;
    const exit = Animated.timing(opacity, { toValue: 0, duration: reduced.current ? 0 : 220, useNativeDriver: true });
    exit.start(({ finished }) => { if (finished) onFinished(); });
    return () => exit.stop();
  }, [introDone, ready, expired, opacity, onFinished]);
  const interpolate = (inputRange: number[], outputRange: number[]) => progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  return <Animated.View testID="startup-splash" onLayout={event => {
    if (event.nativeEvent.layout.width > 0 && event.nativeEvent.layout.height > 0) setLaidOut(true);
  }} style={[styles.screen, { opacity }]}
    accessibilityRole="progressbar" accessibilityLabel="Starting Chase" accessibilityState={{ busy: true }}>
    <StatusBar style="light" />
    <View style={styles.brand} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.stage}>
        {[-1, 0, 1].map(direction => <Animated.View key={direction} style={[styles.card, {
          opacity: interpolate([0, 0.14, 0.55, 0.8], [0, 1, 1, 0]),
          transform: [
            { translateY: interpolate([0, 0.4, 0.75], [48, direction === 0 ? -8 : 0, 0]) },
            { translateX: interpolate([0, 0.35, 0.75], [direction * 8, direction * 28, 0]) },
            { rotate: progress.interpolate({ inputRange: [0, 0.35, 0.75], outputRange: [`${direction * 5}deg`, `${direction * 18}deg`, '0deg'], extrapolate: 'clamp' }) },
          ],
        }]}><View style={styles.cardDash} /><View style={styles.diamond} /><View style={[styles.cardDash, { alignSelf: 'flex-end' }]} /></Animated.View>)}
        <Animated.View style={[styles.frame, { opacity: interpolate([0.08, 0.45, 1], [0, 1, 1]),
          transform: [{ scale: interpolate([0.08, 0.55, 1], [1.18, 1, 0.88]) }, { scaleY: interpolate([0.65, 1], [1, 0.875]) }] }]}>
          {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => <View key={corner} style={[styles.corner, styles[corner]]} />)}
          <Animated.View style={[styles.scan, { opacity: interpolate([0.22, 0.3, 0.62, 0.72], [0, 1, 1, 0]), transform: [{ translateY: interpolate([0.22, 0.7], [8, 112]) }] }]} />
        </Animated.View>
      </View>
      <Animated.View testID="splash-wordmark" style={{ opacity: interpolate([0.18, 0.55, 1], [0, 1, 1]), transform: [{ translateY: interpolate([0.18, 0.65], [12, 0]) }] }}>
        <Label maxFontSizeMultiplier={1.4} style={styles.wordmark}>chase</Label>
      </Animated.View>
    </View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: 24 },
  brand: { alignItems: 'center', gap: 8 },
  stage: { width: 184, height: 168, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: 76, height: 104, borderRadius: 9, backgroundColor: colors.white, padding: 10, justifyContent: 'space-between', borderWidth: 1, borderColor: colors.tintBorder },
  cardDash: { width: 16, height: 3, backgroundColor: colors.primary, borderRadius: 2 },
  diamond: { width: 22, height: 22, backgroundColor: colors.primarySoft, alignSelf: 'center', transform: [{ rotate: '45deg' }] },
  frame: { position: 'absolute', width: 112, height: 128 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: colors.white },
  topLeft: { left: 0, top: 0, borderLeftWidth: 5, borderTopWidth: 5, borderTopLeftRadius: 9 },
  topRight: { right: 0, top: 0, borderRightWidth: 5, borderTopWidth: 5, borderTopRightRadius: 9 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 5, borderBottomWidth: 5, borderBottomLeftRadius: 9 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 5, borderBottomWidth: 5, borderBottomRightRadius: 9 },
  scan: { position: 'absolute', left: 8, right: 8, height: 2, backgroundColor: colors.white },
  wordmark: { color: colors.white, fontSize: 52, lineHeight: 64, fontWeight: '800', letterSpacing: -2 },
});
