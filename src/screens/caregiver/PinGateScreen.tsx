/**
 * Espace aidant — saisie du code PIN (cahier V3.0 §6.1).
 *
 * - Code à 6 chiffres, pavé numérique géant (touches ≥ 72 dp), jamais de clavier système
 *   (pas de suggestion, d'autoremplissage ni de mémorisation par le téléphone).
 * - Code toujours masqué : 6 pastilles, aucun bouton « afficher ».
 * - Discrétion vocale : après chaque appui, le lecteur d'écran annonce « Chiffre saisi,
 *   3 sur 6 », jamais le chiffre. Les touches portent leur chiffre pour qu'un aidant
 *   aveugle puisse les trouver en explorant l'écran (casque conseillé dans l'aide).
 * - 3 codes erronés : blocage de 15 minutes avec compte à rebours, aidant prévenu.
 * - Premier accès sans code enregistré : création du code en deux saisies, avec refus
 *   des codes trop simples. `purpose="change"` : nouveau code après authentification.
 * - Fermeture automatique après 3 minutes sans activité.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessibleText as T } from '../../components/AccessibleText';
import { BigButton } from '../../components/BigButton';
import type { PinVault } from '../../services/security/pinVault';
import { PIN_LENGTH, checkPinStrength } from '../../services/security/pinPolicy';
import { useInactivityTimeout } from '../../hooks/useInactivityTimeout';
import { useStrings } from '../../i18n';
import { borderWidth, colors, radius, spacing, theme, touchTarget, typography } from '../../theme/theme';

export interface PinGateScreenProps {
  readonly vault: PinVault;
  /**
   * `unlock` : vérifier ; `change` : nouveau code après authentification ;
   * `reset` : nouveau code après vérification par texto (« Code oublié ? ») ;
   * `create` : premier code, pendant la configuration initiale.
   * Hors `create`, l'absence de code n'ouvre JAMAIS la création d'un code : l'espace
   * aidant resterait sinon ouvert à quiconque après un effacement du stockage sécurisé.
   */
  readonly purpose: 'unlock' | 'change' | 'reset' | 'create';
  /** Texte au-dessus du pavé (étape de la configuration, par exemple). */
  readonly intro?: string;
  /** « Code oublié ? » : vérification par texto au cellulaire de l'aidant. */
  readonly onForgot?: () => void;
  readonly onSuccess: () => void;
  readonly onCancel: () => void;
  /** 3e code erroné : prévenir l'aidant principal (V3.0 §6.3). */
  readonly onLockout: (lockedUntil: number) => void;
  readonly now?: () => number;
}

type Flow = 'loading' | 'verify' | 'create_first' | 'create_confirm' | 'checking' | 'locked';
type Message = { readonly text: string; readonly tone: 'info' | 'error' } | null;

const INACTIVITY_MS = 3 * 60 * 1000;

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['cancel', '0', 'erase'],
] as const;

type Key = (typeof KEYS)[number][number];

const announce = (text: string): void => AccessibilityInfo.announceForAccessibility(text);

export const PinGateScreen: React.FC<PinGateScreenProps> = ({
  vault,
  purpose,
  intro,
  onForgot,
  onSuccess,
  onCancel,
  onLockout,
  now = Date.now,
}) => {
  const S = useStrings();
  const P = S.pin;
  const [flow, setFlow] = useState<Flow>('loading');
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [clock, setClock] = useState(now());
  /** Saisie en cours : gardée hors de l'état React (jamais rendue, jamais journalisée). */
  const digits = useRef('');
  const firstPin = useRef<string | null>(null);
  const resumeFlow = useRef<Flow>('verify');

  const resetInactivity = useInactivityTimeout(onCancel, INACTIVITY_MS);

  const clearEntry = useCallback(() => {
    digits.current = '';
    setCount(0);
  }, []);

  const applyStatus = useCallback((st: Awaited<ReturnType<PinVault['status']>>) => {
    if (purpose === 'change' || purpose === 'reset' || purpose === 'create') {
      setFlow('create_first');
      setMessage({ text: purpose === 'create' ? P.firstAccessIntro : P.newCodeIntro, tone: 'info' });
      return;
    }
    if (st.state === 'locked') {
      setLockedUntil(st.lockedUntil);
      setFlow('locked');
    } else if (st.state === 'not_set') {
      setFlow('verify');
      setMessage({ text: P.noCodeUseForgot, tone: 'error' });
      announce(P.noCodeUseForgot);
    } else {
      setFlow('verify');
      setMessage(null);
    }
  }, [purpose, P]);

  const loadStatus = useCallback(() => vault.status().then(applyStatus), [vault, applyStatus]);

  useEffect(() => {
    let active = true;
    void vault.status().then((st) => { if (active) applyStatus(st); });
    return () => {
      active = false;
      digits.current = '';
      firstPin.current = null;
    };
  }, [vault, applyStatus]);

  /* Compte à rebours du blocage. */
  useEffect(() => {
    if (flow !== 'locked' || lockedUntil === null) return;
    const id = setInterval(() => {
      const t = now();
      setClock(t);
      if (t >= lockedUntil) {
        clearInterval(id);
        setLockedUntil(null);
        void loadStatus();
        announce(P.unlockedAgain);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [flow, lockedUntil, now, loadStatus, P]);

  const fail = useCallback(
    (text: string, back: Flow) => {
      Vibration.vibrate(80);
      clearEntry();
      setMessage({ text, tone: 'error' });
      setFlow(back);
      announce(text);
    },
    [clearEntry],
  );

  const submit = useCallback(async () => {
    const pin = digits.current;
    const current = resumeFlow.current;
    // Laisse s'afficher « Vérification… » avant le hachage (synchrone).
    await new Promise<void>((r) => setTimeout(r, 30));

    if (current === 'verify') {
      const r = await vault.verify(pin);
      clearEntry();
      if (r.ok) {
        announce(P.codeOk);
        onSuccess();
      } else if (r.reason === 'wrong') {
        fail(P.wrong(r.attemptsLeft), 'verify');
      } else if (r.reason === 'locked') {
        Vibration.vibrate(200);
        setLockedUntil(r.lockedUntil);
        setFlow('locked');
        setMessage(null);
        if (r.justLocked) onLockout(r.lockedUntil);
        announce(P.lockedAnnounce);
      } else {
        void loadStatus();
      }
      return;
    }

    if (current === 'create_first') {
      const weakness = checkPinStrength(pin);
      if (weakness) {
        fail(P.weakness(weakness), 'create_first');
        return;
      }
      firstPin.current = pin;
      clearEntry();
      setFlow('create_confirm');
      setMessage({ text: P.sameAgain, tone: 'info' });
      announce(P.sameAgain);
      return;
    }

    if (current === 'create_confirm') {
      const first = firstPin.current;
      firstPin.current = null;
      if (first !== pin) {
        fail(P.mismatch, 'create_first');
        return;
      }
      const r = await vault.setPin(pin);
      clearEntry();
      if (!r.ok) {
        fail(P.weakness(r.weakness), 'create_first');
        return;
      }
      announce(P.codeSaved);
      onSuccess();
    }
  }, [vault, clearEntry, fail, onSuccess, onLockout, loadStatus, P]);

  const press = useCallback(
    (key: Key) => {
      resetInactivity();
      if (key === 'cancel') {
        clearEntry();
        firstPin.current = null;
        onCancel();
        return;
      }
      if (flow === 'loading' || flow === 'checking' || flow === 'locked') return;
      if (key === 'erase') {
        if (digits.current.length === 0) return;
        digits.current = digits.current.slice(0, -1);
        setCount(digits.current.length);
        announce(P.digitErased(digits.current.length, PIN_LENGTH));
        return;
      }
      if (digits.current.length >= PIN_LENGTH) return;
      digits.current += key;
      const n = digits.current.length;
      setCount(n);
      setMessage(null);
      // Jamais le chiffre lui-même.
      announce(n < PIN_LENGTH ? P.digitEntered(n, PIN_LENGTH) : P.digitEnteredLast);
      if (n === PIN_LENGTH) {
        resumeFlow.current = flow;
        setFlow('checking');
        void submit();
      }
    },
    [flow, clearEntry, onCancel, resetInactivity, submit, P],
  );

  const locked = flow === 'locked';
  const keypadDisabled = locked || flow === 'checking' || flow === 'loading';
  const remaining = lockedUntil !== null ? S.format.countdown(lockedUntil - clock) : null;

  const instruction =
    flow === 'create_first' ? P.choose : flow === 'create_confirm' ? P.confirm : flow === 'checking' ? P.checking : P.enter;

  return (
    <SafeAreaView style={theme.baseStyles.screen} onTouchStart={resetInactivity}>
      <View style={styles.container}>
        <T style={typography.title} accessibilityRole="header">
          {P.title}
        </T>
        {intro ? <T style={typography.bodyBold}>{intro}</T> : null}
        <T style={typography.body}>{locked ? P.blocked : instruction}</T>

        {/* Pastilles : nombre de chiffres saisis, jamais leur valeur. */}
        <View
          style={styles.dots}
          accessible
          accessibilityRole="text"
          accessibilityLabel={P.digitsA11y(count, PIN_LENGTH)}
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View key={i} style={[styles.dot, i < count && styles.dotFilled]} />
          ))}
        </View>

        {message ? (
          <View
            style={[styles.message, message.tone === 'error' && styles.messageError]}
            accessible
            accessibilityRole={message.tone === 'error' ? 'alert' : 'text'}
            accessibilityLiveRegion="polite"
          >
            <T style={typography.bodyBold}>
              {message.tone === 'error' ? '⚠ ' : ''}
              {message.text}
            </T>
          </View>
        ) : null}

        {locked && remaining ? (
          <View style={[styles.message, styles.messageError]}>
            <T style={typography.bodyBold} importantForAccessibility="no">
              {P.lockedBanner}
            </T>
            {/* Seconde par seconde à l'écran ; à la minute pour le lecteur d'écran. */}
            <T style={typography.display} importantForAccessibility="no">
              {P.retryIn(remaining.visual)}
            </T>
            <View
              accessible
              accessibilityRole="timer"
              accessibilityLiveRegion="polite"
              accessibilityLabel={P.lockedA11y(remaining.spoken)}
            />
          </View>
        ) : null}

        <View style={styles.keypad}>
          {KEYS.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((key) => {
                const isDigit = key !== 'cancel' && key !== 'erase';
                const disabled = key === 'cancel' ? false : keypadDisabled;
                const label = key === 'cancel' ? S.common.cancel : key === 'erase' ? P.erase : key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => press(key)}
                    disabled={disabled}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    {...(key === 'cancel'
                      ? { accessibilityHint: P.cancelHint }
                      : key === 'erase'
                        ? { accessibilityHint: P.eraseHint }
                        : {})}
                    accessibilityState={{ disabled }}
                    style={({ pressed }) => [
                      styles.key,
                      !isDigit && styles.keySecondary,
                      disabled && styles.keyDisabled,
                      pressed && styles.keyPressed,
                    ]}
                  >
                    <T style={isDigit ? typography.display : typography.bodyBold} importantForAccessibility="no">
                      {label}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {onForgot && (flow === 'verify' || flow === 'locked') ? (
          <BigButton label={P.forgot} variant="secondary" accessibilityHint={P.forgotHint} onPress={onForgot} />
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.md, justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.md },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: borderWidth.emphasis,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dotFilled: { backgroundColor: colors.text },
  message: { borderRadius: radius.card, padding: spacing.md, backgroundColor: colors.offlineBackground, gap: spacing.xs },
  messageError: { backgroundColor: colors.infoBackground },
  keypad: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  key: {
    flex: 1,
    minHeight: touchTarget.listRow,
    minWidth: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  keySecondary: { backgroundColor: colors.offlineBackground },
  keyDisabled: { borderStyle: 'dashed' },
  keyPressed: { borderWidth: borderWidth.emphasis, backgroundColor: colors.successBackground },
});

export default PinGateScreen;
