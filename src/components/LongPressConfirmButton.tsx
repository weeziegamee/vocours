/**
 * Bouton géant à appui maintenu (« Je commande ») — V3.0 §3.3, état B3.
 *
 * - Confirmation seulement après `holdMs` (2 s) d'appui continu ; lâcher avant annule.
 * - Jauge de progression visible + texte d'état : le sens ne dépend pas de l'animation.
 * - Lecteur d'écran : le double-tap déclenche l'action `activate` (geste délibéré),
 *   car un appui maintenu est difficile avec VoiceOver / TalkBack. La seconde
 *   confirmation reste distincte de la première, donnée avant d'activer ce bouton.
 * - Vibration courte au début, longue à la confirmation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Vibration,
  View,
  type AccessibilityActionEvent,
} from 'react-native';

import { AccessibleText as T } from './AccessibleText';
import { useStrings } from '../i18n';
import { colors, radius, spacing, theme, touchTarget, typography } from '../theme/theme';

export type LongPressOutcome =
  | { readonly method: 'long_press'; readonly durationMs: number }
  | { readonly method: 'screen_reader_action' };

export interface LongPressConfirmButtonProps {
  readonly label: string; // « Je commande »
  readonly sublabel?: string; // « Paul finalisera le paiement »
  readonly enabled: boolean;
  readonly holdMs?: number;
  readonly accessibilityHint: string;
  readonly onHoldStart?: () => void;
  readonly onReleasedEarly?: () => void;
  readonly onConfirmed: (outcome: LongPressOutcome) => void;
}

export const LongPressConfirmButton: React.FC<LongPressConfirmButtonProps> = ({
  label,
  sublabel,
  enabled,
  holdMs = theme.timing.commitLongPressMs,
  accessibilityHint,
  onHoldStart,
  onReleasedEarly,
  onConfirmed,
}) => {
  const S = useStrings();
  const [progress] = useState(() => new Animated.Value(0));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const startedAt = useRef<number | null>(null);
  const confirmed = useRef(false);
  const [holding, setHolding] = useState(false);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    setHolding(false);
  }

  const reset = useCallback(() => {
    animation.current?.stop();
    animation.current = null;
    startedAt.current = null;
    setHolding(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: theme.motion.maxDurationMs,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => () => animation.current?.stop(), []);
  // Désactivé (envoi en cours, annulation…) : on réarme pour une prochaine tentative.
  useEffect(() => {
    if (!enabled) {
      confirmed.current = false;
      animation.current?.stop();
      animation.current = null;
      startedAt.current = null;
      progress.setValue(0);
    }
  }, [enabled, progress]);

  const handlePressIn = (): void => {
    if (!enabled || confirmed.current) return;
    startedAt.current = Date.now();
    setHolding(true);
    Vibration.vibrate(30);
    onHoldStart?.();
    AccessibilityInfo.announceForAccessibility(S.longPress.holding);
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      useNativeDriver: false, // largeur animée
    });
    animation.current.start(({ finished }) => {
      if (!finished || startedAt.current === null || confirmed.current) return;
      confirmed.current = true;
      const durationMs = Date.now() - startedAt.current;
      setHolding(false);
      Vibration.vibrate(120);
      onConfirmed({ method: 'long_press', durationMs });
    });
  };

  const handlePressOut = (): void => {
    if (confirmed.current || startedAt.current === null) return;
    reset();
    onReleasedEarly?.();
  };

  const handleAccessibilityAction = (e: AccessibilityActionEvent): void => {
    if (e.nativeEvent.actionName !== 'activate' || !enabled || confirmed.current) return;
    confirmed.current = true;
    Vibration.vibrate(120);
    onConfirmed({ method: 'screen_reader_action' });
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const status = !enabled ? S.longPress.unavailable : holding ? S.longPress.holding : S.longPress.hold;

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!enabled}
      accessible
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !enabled, busy: holding }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={handleAccessibilityAction}
      style={[styles.button, !enabled && styles.disabled]}
    >
      <View style={styles.gaugeTrack} importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.gaugeFill, { width }]} />
      </View>
      <T style={enabled ? typography.action : typography.bodyBold} importantForAccessibility="no">
        {label}
      </T>
      {sublabel ? (
        <T
          style={[typography.caption, enabled && styles.onAction]}
          importantForAccessibility="no"
        >
          {sublabel}
        </T>
      ) : null}
      <T
        style={[typography.caption, enabled && styles.onAction]}
        importantForAccessibility="no"
      >
        {status}
      </T>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget.primaryCommit,
    borderRadius: radius.button,
    backgroundColor: colors.actionBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
  },
  disabled: {
    backgroundColor: colors.disabledBackground,
    borderWidth: theme.borderWidth.card,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  gaugeTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 12,
    backgroundColor: colors.gaugeTrack,
  },
  gaugeFill: { height: '100%', backgroundColor: colors.gaugeFill },
  // Texte de 20 pt sur vert : 6,61:1 → en gras pour rester « texte large » au sens WCAG.
  onAction: { color: colors.actionText, fontWeight: '700' },
});

export default LongPressConfirmButton;
