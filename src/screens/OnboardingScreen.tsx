/**
 * Premier lancement, fait par l'aidant :
 *   langue → présentation et consentement (Loi 25, LPRPDE) → [code de l'aidant →
 *   réglages → confirmation du cellulaire : autres écrans] → « Tout est prêt ».
 * Aussi : écran « Ce téléphone doit être reconfiguré » si le compte n'est plus reconnu.
 */

import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppLocale } from '../types/vocourse';
import { AccessibleText as T } from '../components/AccessibleText';
import { BigButton } from '../components/BigButton';
import { ToggleRow } from '../components/form';
import { useStrings } from '../i18n';
import { colors, radius, spacing, theme, typography } from '../theme/theme';

export type OnboardingStep = 'language' | 'consent' | 'done' | 'session_lost';

export interface OnboardingScreenProps {
  readonly step: OnboardingStep;
  readonly platform: 'ios' | 'android';
  readonly busy: boolean;
  readonly error: string | null;
  readonly seniorFirstName: string | null;
  readonly onChooseLanguage: (locale: AppLocale) => void;
  readonly onAccept: (cloudSpeech: boolean) => void;
  readonly onOpenPrivacy: () => void;
  readonly onDone: () => void;
  readonly onRestart: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = (p) => {
  const S = useStrings();
  const O = S.onboarding;
  const [accepted, setAccepted] = useState(false);
  const [cloudSpeech, setCloudSpeech] = useState(false);
  const [showRequired, setShowRequired] = useState(false);

  if (p.step === 'language') {
    // Écran bilingue : la langue n'est pas encore choisie.
    return (
      <SafeAreaView style={[theme.baseStyles.screen, styles.center]}>
        <View style={styles.block}>
          <T style={[typography.greeting, styles.text]} accessibilityRole="header">
            Vocourse
          </T>
          <T style={[typography.body, styles.text]}>Choisissez la langue · Choose your language</T>
          <BigButton label="Français" accessibilityHint="Utiliser l’application en français" onPress={() => p.onChooseLanguage('fr-CA')} />
          <BigButton label="English" accessibilityHint="Use the app in English" onPress={() => p.onChooseLanguage('en-CA')} />
        </View>
      </SafeAreaView>
    );
  }

  if (p.step === 'done' || p.step === 'session_lost') {
    const done = p.step === 'done';
    return (
      <SafeAreaView style={[theme.baseStyles.screen, styles.center]}>
        <View style={[styles.block, done ? styles.success : styles.info]} accessible accessibilityRole="alert">
          <T style={[typography.display, styles.text]} importantForAccessibility="no">
            {done ? '✓' : '⚠'}
          </T>
          <T style={[typography.title, styles.text]}>{done ? O.done : O.sessionLost}</T>
          <T style={[typography.body, styles.text]}>{done ? O.doneBody(p.seniorFirstName) : O.sessionLostBody}</T>
        </View>
        <View style={styles.block}>
          <BigButton label={done ? O.start : O.restart} onPress={done ? p.onDone : p.onRestart} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={theme.baseStyles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <T style={typography.greeting} accessibilityRole="header">
          {O.welcomeTitle}
        </T>
        <T style={typography.body}>{O.welcomeBody}</T>
        <T style={typography.bodyBold}>{O.whoSetsUp}</T>

        <T style={typography.title} accessibilityRole="header">
          {O.privacyTitle}
        </T>
        {O.privacyPoints.map((point) => (
          <View key={point} style={styles.point}>
            <T style={typography.body} importantForAccessibility="no">
              •
            </T>
            <T style={[typography.body, styles.flex]}>{point}</T>
          </View>
        ))}
        <BigButton label={O.privacyLink} variant="secondary" accessibilityHint={O.privacyLinkHint} onPress={p.onOpenPrivacy} />

        <ToggleRow label={O.cloudSpeechLabel} description={O.cloudSpeechDescription(p.platform)} value={cloudSpeech} onChange={setCloudSpeech} />
        <ToggleRow
          kind="checkbox"
          label={O.acceptLabel}
          description={O.acceptDescription}
          value={accepted}
          onChange={(v) => {
            setAccepted(v);
            if (v) setShowRequired(false);
          }}
          {...(showRequired ? { error: O.acceptRequired } : {})}
        />

        {p.error ? (
          <View style={styles.info} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
            <T style={typography.bodyBold}>⚠ {p.error}</T>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {p.busy ? (
          <View style={styles.busy} accessible accessibilityRole="progressbar" accessibilityLabel={O.registering} accessibilityState={{ busy: true }}>
            <ActivityIndicator size="large" color={colors.text} />
            <T style={typography.bodyBold}>{O.registering}</T>
          </View>
        ) : (
          <BigButton
            label={O.accept}
            onPress={() => {
              if (!accepted) {
                setShowRequired(true);
                return;
              }
              p.onAccept(cloudSpeech);
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', padding: spacing.md, gap: spacing.lg },
  block: { gap: spacing.md, padding: spacing.md, borderRadius: radius.card },
  success: { backgroundColor: colors.successBackground },
  info: { backgroundColor: colors.infoBackground, borderRadius: radius.card, padding: spacing.md },
  text: { textAlign: 'center' },
  scroll: { padding: spacing.md, gap: spacing.lg },
  point: { flexDirection: 'row', gap: spacing.xs },
  busy: { alignItems: 'center', gap: spacing.md },
  footer: {
    padding: spacing.md,
    borderTopWidth: theme.borderWidth.card,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});

export default OnboardingScreen;
