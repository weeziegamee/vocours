import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Vrai si « Réduire les animations » est actif. */
export const useReduceMotion = (): boolean => {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
};

/**
 * Suit VoiceOver / TalkBack. Le TTS Vocourse doit se taire quand un lecteur
 * d'écran parle (V3.0 §3.1) ; `onChange` est appelé à chaque changement.
 */
export const useScreenReader = (onChange?: (enabled: boolean) => void): boolean => {
  const [enabled, setEnabled] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let mounted = true;
    const update = (v: boolean): void => {
      if (!mounted) return;
      setEnabled(v);
      cb.current?.(v);
    };
    void AccessibilityInfo.isScreenReaderEnabled().then(update);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', update);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return enabled;
};
