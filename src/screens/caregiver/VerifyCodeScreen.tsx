/**
 * Code reçu par texto au cellulaire de l'aidant, pour :
 *  - `mobile` : confirmer le numéro (obligatoire avant d'envoyer des listes) ;
 *  - `pin_reset` : choisir un nouveau code d'aidant oublié.
 * Le code est vérifié par le serveur (5 essais, 10 minutes). Le clavier propose le code
 * reçu (iOS « oneTimeCode », Android « sms-otp »).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BackendError, VerificationPurpose } from '../../types/vocourse';
import type { VocourseBackend } from '../../services/api/vocourseBackend';
import { AccessibleText as T } from '../../components/AccessibleText';
import { BigButton } from '../../components/BigButton';
import { FormField } from '../../components/form';
import { useInactivityTimeout } from '../../hooks/useInactivityTimeout';
import { useStrings, type Strings } from '../../i18n';
import { colors, radius, spacing, theme, typography } from '../../theme/theme';

export interface VerifyCodeScreenProps {
  readonly purpose: VerificationPurpose;
  readonly backend: Pick<VocourseBackend, 'startVerification' | 'confirmVerification'>;
  readonly intro?: string;
  readonly onVerified: () => void;
  /** « Plus tard » (configuration) ou « Annuler » (code oublié). */
  readonly onSkip: () => void;
  readonly skipLabel: string;
  readonly skipHint: string;
}

type Status =
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent'; readonly sentTo: string }
  | { readonly kind: 'checking' }
  | { readonly kind: 'error'; readonly text: string; readonly canResend: boolean };

const errorText = (S: Strings, e: BackendError): { text: string; canResend: boolean } => {
  const V = S.verify;
  if (e.code === 'invalid_code') return { text: V.invalid(e.attemptsLeft ?? 0), canResend: (e.attemptsLeft ?? 0) === 0 };
  if (e.code === 'code_expired' || e.status === 410) return { text: V.expired, canResend: true };
  if (e.code === 'caregiver_opted_out') return { text: V.optedOut, canResend: true };
  if (e.kind === 'rate_limited') return { text: V.rateLimited, canResend: false };
  if (e.kind === 'offline' || e.kind === 'timeout') return { text: V.offline, canResend: true };
  return { text: V.sendFailed, canResend: true };
};

const INACTIVITY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30_000;

export const VerifyCodeScreen: React.FC<VerifyCodeScreenProps> = ({ purpose, backend, intro, onVerified, onSkip, skipLabel, skipHint }) => {
  const S = useStrings();
  const V = S.verify;
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'sending' });
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(true);
  const resetInactivity = useInactivityTimeout(onSkip, INACTIVITY_MS);

  useEffect(() => {
    mounted.current = true;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, []);

  const handleSent = useCallback((r: Awaited<ReturnType<typeof backend.startVerification>>, sentAt: number) => {
    if (!mounted.current) return;
    setLastSentAt(sentAt);
    if (r.ok) {
      setStatus({ kind: 'sent', sentTo: r.value.sentTo });
      AccessibilityInfo.announceForAccessibility(V.sent(r.value.sentTo));
    } else {
      const e = errorText(S, r.error);
      setStatus({ kind: 'error', ...e });
      AccessibilityInfo.announceForAccessibility(e.text);
    }
  }, [backend, S, V]);

  const send = useCallback(() => {
    const sentAt = Date.now();
    return backend.startVerification(purpose).then((r) => handleSent(r, sentAt));
  }, [backend, purpose, handleSent]);

  useEffect(() => {
    let active = true;
    const sentAt = Date.now();
    void backend.startVerification(purpose).then((r) => {
      if (active) handleSent(r, sentAt);
    });
    return () => { active = false; };
    // Un seul envoi à l'arrivée sur l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async () => {
    resetInactivity();
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return;
    setStatus({ kind: 'checking' });
    const r = await backend.confirmVerification(purpose, digits);
    if (!mounted.current) return;
    if (r.ok) {
      AccessibilityInfo.announceForAccessibility(V.verified);
      onVerified();
      return;
    }
    const e = errorText(S, r.error);
    setStatus({ kind: 'error', ...e });
    setCode('');
    AccessibilityInfo.announceForAccessibility(e.text);
  }, [code, backend, purpose, onVerified, resetInactivity, S, V]);

  const cooldownLeft = Math.max(0, RESEND_COOLDOWN_MS - (now - lastSentAt));
  const busy = status.kind === 'sending' || status.kind === 'checking';

  return (
    <SafeAreaView style={theme.baseStyles.screen} onTouchStart={resetInactivity}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <T style={typography.title} accessibilityRole="header">
            {purpose === 'mobile' ? V.titleMobile : V.titlePin}
          </T>
          {intro ? <T style={typography.bodyBold}>{intro}</T> : null}

          <View
            style={[styles.banner, status.kind === 'error' && styles.bannerError]}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityRole={status.kind === 'error' ? 'alert' : 'text'}
          >
            <T style={typography.bodyBold}>
              {status.kind === 'sending'
                ? V.sending
                : status.kind === 'checking'
                  ? V.checking
                  : status.kind === 'sent'
                    ? V.sent(status.sentTo)
                    : `⚠ ${status.text}`}
            </T>
          </View>

          <FormField
            label={V.codeLabel}
            hint={V.codeHint}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
          />
          <BigButton label={status.kind === 'checking' ? V.checking : V.submit} disabled={busy || code.length !== 6} onPress={() => void submit()} />
          <BigButton
            label={cooldownLeft > 0 ? `${V.resend} (${Math.ceil(cooldownLeft / 1000)} s)` : V.resend}
            variant="secondary"
            disabled={busy || cooldownLeft > 0 || (status.kind === 'error' && !status.canResend)}
            onPress={() => {
              setStatus({ kind: 'sending' });
              setCode('');
              void send();
            }}
          />
          <BigButton label={skipLabel} variant="secondary" accessibilityHint={skipHint} onPress={onSkip} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.md, gap: spacing.lg },
  banner: { backgroundColor: colors.offlineBackground, borderRadius: radius.card, padding: spacing.md },
  bannerError: { backgroundColor: colors.infoBackground },
});

export default VerifyCodeScreen;
