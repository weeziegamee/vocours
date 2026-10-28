/**
 * Micro central de l'écran d'accueil et son état.
 *
 * - Au repos : grand disque vert dans un halo soleil, l'invitation à parler.
 * - À l'écoute : le disque passe au bleu « bleuet » et trois ondes s'en éloignent
 *   lentement (cycle de 2,2 s). « Réduire les animations » : deux anneaux fixes.
 * - En dessous : l'état en mots, avec un symbole (jamais la couleur seule), annoncé
 *   par le lecteur d'écran, et la transcription en direct pendant l'écoute.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import type { MicState } from '../../types/vocourse';
import type { HomeStatus, HomeTone } from '../../screens/home/homeModel';
import { AccessibleText as T } from '../AccessibleText';
import { MicIcon } from '../icons';
import { useStrings } from '../../i18n';
import { colors, radius, spacing, theme, touchTarget, typography } from '../../theme/theme';

const D = touchTarget.mic;
const STAGE = Math.round(D * 1.55);
const WAVES = [0, 1, 2] as const;

const TONE_BACKGROUND: Readonly<Record<HomeTone, string>> = {
  idle: colors.surface,
  listening: colors.listeningTint,
  processing: colors.waitingTint,
  added: colors.successBackground,
  doubt: colors.waitingTint,
  offline: colors.offlineBackground,
};

export interface MicHeroProps {
  readonly micState: MicState;
  readonly status: HomeStatus;
  readonly reduceMotion: boolean;
  readonly onPress: () => void;
}

const Waves: React.FC<{ readonly active: boolean; readonly reduceMotion: boolean }> = ({ active, reduceMotion }) => {
  const [values] = useState(() => WAVES.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (!active || reduceMotion) {
      values.forEach((v) => v.setValue(0));
      return;
    }
    const period = theme.timing.listeningWaveMs;
    const anims = values.map((v, i) =>
      Animated.sequence([
        Animated.delay((period / WAVES.length) * i),
        Animated.loop(
          Animated.timing(v, { toValue: 1, duration: period, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ),
      ]),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [active, reduceMotion, values]);

  if (!active) return null;

  if (reduceMotion) {
    // Repère fixe et calme : deux anneaux immobiles.
    return (
      <>
        <View style={[styles.wave, { transform: [{ scale: 1.18 }], opacity: 0.6 }]} />
        <View style={[styles.wave, { transform: [{ scale: 1.36 }], opacity: 0.3 }]} />
      </>
    );
  }

  return (
    <>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.wave,
            {
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
            },
          ]}
        />
      ))}
    </>
  );
};

export const MicHero: React.FC<MicHeroProps> = ({ micState, status, reduceMotion, onPress }) => {
  const listening = micState === 'listening' || micState === 'offline_recording';
  const processing = micState === 'processing';
  const a11y = useStrings().home.mic[micState];

  return (
    <View style={styles.container}>
      <View style={styles.stage} importantForAccessibility="no">
        {!listening ? <View style={styles.halo} importantForAccessibility="no-hide-descendants" /> : null}
        <Waves active={listening} reduceMotion={reduceMotion} />
        <Pressable
          onPress={onPress}
          disabled={processing}
          accessible
          accessibilityRole="button"
          accessibilityLabel={a11y.label}
          accessibilityHint={a11y.hint}
          accessibilityState={{ busy: processing, disabled: processing }}
          style={({ pressed }) => [
            styles.disc,
            listening && styles.discListening,
            pressed && !listening && styles.discPressed,
          ]}
        >
          {processing ? (
            <ActivityIndicator size="large" color={colors.actionText} />
          ) : (
            <MicIcon size={D * 0.46} color={colors.actionText} />
          )}
        </Pressable>
      </View>

      <View
        style={[styles.status, { backgroundColor: TONE_BACKGROUND[status.tone] }]}
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${status.title} ${status.detail}`}
      >
        <View style={styles.statusRow}>
          <T style={typography.title} importantForAccessibility="no">
            {status.symbol}
          </T>
          <T style={[typography.title, styles.statusTitle]} importantForAccessibility="no">
            {status.title}
          </T>
        </View>
        {status.detail ? (
          <T style={[typography.body, styles.statusDetail]} importantForAccessibility="no">
            {status.detail}
          </T>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md },
  stage: { width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: D * 1.32,
    height: D * 1.32,
    borderRadius: (D * 1.32) / 2,
    backgroundColor: colors.halo,
  },
  wave: {
    position: 'absolute',
    width: D,
    height: D,
    borderRadius: D / 2,
    borderWidth: 6,
    borderColor: colors.listening,
  },
  disc: {
    width: D,
    height: D,
    borderRadius: D / 2,
    backgroundColor: colors.actionBackground,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: colors.text,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  discPressed: { backgroundColor: colors.actionBackgroundPressed, transform: [{ scale: 0.97 }] },
  discListening: { backgroundColor: colors.listening },
  status: {
    alignSelf: 'stretch',
    borderRadius: radius.card,
    borderWidth: theme.borderWidth.card,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusTitle: { flexShrink: 1 },
  statusDetail: { color: colors.text },
});

export default MicHero;
