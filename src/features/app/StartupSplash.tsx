import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Label } from '@/components/ui';
import { colors } from '@/theme/tokens';

// Hold the native background only until the custom splash has actually laid out.
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => {});
const hideNative = () => { if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => {}); };

/** Bundled brand artwork, once per launch; no network, prices or scanner work is required. */
export function StartupSplash({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const [markReady, setMarkReady] = useState(false);
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
    if (!laidOut || !markReady) return;
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
      animation = Animated.timing(progress, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true });
      animation.start(({ finished }) => { if (finished) complete(); });
    });
    return () => { active = false; listener.remove(); if (preferenceTimer) clearTimeout(preferenceTimer); animation?.stop(); };
  }, [laidOut, markReady, progress]);
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
      <Animated.View style={[styles.stage, {
        transform: [
          { translateY: interpolate([0, 0.7, 1], [0, -20, -20]) },
          { scale: interpolate([0, 0.45, 1], [1, 1.035, 1]) },
        ],
      }]}>
        <Image testID="splash-brand-mark" source={require('@/assets/brand/mark.png')} resizeMode="contain"
          onLoadEnd={() => setMarkReady(true)} style={styles.mark} accessible={false} />
      </Animated.View>
      <Animated.View testID="splash-wordmark" style={[styles.name, { opacity: interpolate([0.18, 0.55, 1], [0, 1, 1]), transform: [{ translateY: interpolate([0.18, 0.65], [12, 0]) }] }]}>
        <Label maxFontSizeMultiplier={1.4} style={styles.wordmark}>chase</Label>
      </Animated.View>
    </View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: 24 },
  brand: { width: 240, height: 240, alignItems: 'center' },
  stage: { width: 240, height: 240 },
  mark: { width: 240, height: 240 },
  name: { position: 'absolute', top: 204, alignSelf: 'center' },
  wordmark: { color: colors.white, fontSize: 52, lineHeight: 64, fontWeight: '800', letterSpacing: -2 },
});
