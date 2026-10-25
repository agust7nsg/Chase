import { useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Focus precedes a native-stack screen's completed appearance. CameraX surfaces
 * must not be acquired inside that transition. Two subsequent frames allow the
 * restored screen geometry to propagate before the camera is mounted.
 *
 * This coordinates JS acquisition; Expo exposes no native camera-release ack.
 */
export function useScannerCameraFocus(focused: boolean, enabled: boolean): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  // A new activation can never inherit the previous activation's ready state,
  // even if a blurred/frozen route's passive effects have not run yet.
  const activation = useMemo(() => ({ focused, enabled, navigation }), [focused, enabled, navigation]);
  const [readyActivation, setReadyActivation] = useState<typeof activation | null>(null);
  const inputs = useRef({ focused, enabled, activation });
  const mounted = useRef(false);
  const listenerVersion = useRef(0);
  const transitioning = useRef(false);
  useLayoutEffect(() => {
    inputs.current = { focused, enabled, activation };
    // A transition whose end was lost while hidden/backgrounded cannot poison
    // the next activation. A new active transition still requires its own end.
    if (!focused || !enabled) transitioning.current = false;
  }, [focused, enabled, activation]);
  const generation = useRef(0);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    generation.current++;
    if (quietTimer.current !== null) clearTimeout(quietTimer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    quietTimer.current = null;
    frame.current = null;
  }, []);

  const block = useCallback(() => {
    cancelPending();
    setReadyActivation(null);
  }, [cancelPending]);

  const settleFrames = useCallback(() => {
    block();
    const current = inputs.current;
    if (!mounted.current || !current.focused || !current.enabled || transitioning.current) return;
    const version = generation.current;
    const eligible = () => mounted.current && version === generation.current
      && inputs.current.activation === current.activation && inputs.current.focused
      && inputs.current.enabled && !transitioning.current;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!eligible()) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (eligible()) setReadyActivation(current.activation);
      });
    });
  }, [block]);

  const settleQuietly = useCallback(() => {
    cancelPending();
    if (!mounted.current || !inputs.current.focused || !inputs.current.enabled || transitioning.current) return;
    // Web/initial entry may have no transition events, or a listener may attach
    // after transitionStart. A known in-flight transition never uses this timer.
    const version = generation.current;
    quietTimer.current = setTimeout(() => {
      quietTimer.current = null;
      if (version === generation.current && !transitioning.current) settleFrames();
    }, 500);
  }, [cancelPending, settleFrames]);

  useEffect(() => {
    mounted.current = true;
    const version = ++listenerVersion.current;
    const currentListener = () => mounted.current && listenerVersion.current === version;
    const start = navigation.addListener('transitionStart', () => {
      if (!currentListener()) return;
      transitioning.current = true;
      block();
    });
    const end = navigation.addListener('transitionEnd', event => {
      if (!currentListener()) return;
      transitioning.current = false;
      if (event.data.closing) block(); else settleFrames();
    });
    const cancel = navigation.addListener('gestureCancel', () => {
      if (!currentListener()) return;
      transitioning.current = false;
      block();
      settleQuietly();
    });
    return () => {
      mounted.current = false;
      cancelPending();
      start(); end(); cancel();
    };
  }, [navigation, block, settleFrames, settleQuietly, cancelPending]);

  useEffect(() => {
    settleQuietly();
    return cancelPending;
  }, [navigation, activation, settleQuietly, cancelPending]);

  return focused && enabled && readyActivation === activation;
}
