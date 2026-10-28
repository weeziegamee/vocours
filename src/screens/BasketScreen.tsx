/**
 * Écran B — « Mon panier » (cahier V3.0 §2 étapes 7 à 12, §3.3 ; avenant Canada CA-1.4).
 *
 * Le senior choisit une gamme (Économique, Équilibré, Bio — sans prix : seuls ceux
 * d'Instacart font foi), écoute la relecture, confirme deux fois ; Vocourse transmet
 * alors la liste au serveur, qui crée la page Instacart et l'envoie par texto à l'aidant.
 * L'aidant choisit le magasin, voit le prix exact et paie.
 *
 * Tout se passe sur cet écran (choix, relecture, confirmation, envoi, résultat) : le
 * parcours senior ne dépasse jamais 2 écrans. Chaque étape se fait au toucher ou à la voix.
 */

import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  AppLocale,
  BasketTier,
  ConfirmedItem,
  HandoffResponse,
  ListId,
  SpeechPort,
  VoiceIntent,
} from '../types/vocourse';
import { BASKET_TIERS } from '../types/vocourse';
import type { VocourseBackend } from '../services/api/vocourseBackend';
import type { Speaker } from '../hooks/useSpeaker';
import { useVoiceAnswer } from '../hooks/useVoiceAnswer';
import { useStrings, type Strings } from '../i18n';
import { basketReducer, initialBasketState, type BasketPhase } from './basketMachine';
import { AccessibleText as T } from '../components/AccessibleText';
import { BigButton } from '../components/BigButton';
import { TierCard } from '../components/TierCard';
import { LongPressConfirmButton, type LongPressOutcome } from '../components/LongPressConfirmButton';
import { colors, radius, spacing, theme, typography } from '../theme/theme';
import { newIdempotencyKey, nowIso } from '../utils/ids';

export interface BasketScreenProps {
  readonly listId: ListId;
  /** Produits confirmés de la liste, dans l'ordre. */
  readonly items: readonly ConfirmedItem[];
  readonly caregiverFirstName: string;
  /** Épicerie préférée choisie par l'aidant (rappel : c'est lui qui choisit le magasin). */
  readonly preferredStore: string | null;
  readonly locale: AppLocale;
  readonly speaker: Speaker;
  readonly speech: SpeechPort;
  readonly backend: Pick<VocourseBackend, 'submitHandoff'>;
  readonly onBackToList: () => void;
  readonly onHandoffSent: (response: HandoffResponse) => void;
}

export const BasketScreen: React.FC<BasketScreenProps> = ({
  listId,
  items,
  caregiverFirstName: caregiver,
  preferredStore: store,
  locale,
  speaker,
  speech,
  backend,
  onBackToList,
  onHandoffSent,
}) => {
  const S = useStrings();
  const B = S.basket;
  const [state, dispatch] = useReducer(basketReducer, 'balanced', initialBasketState);
  const { phase, tier } = state;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      speaker.stop();
    };
  }, [speaker]);

  /* Annonce d'arrivée. */
  useEffect(() => {
    void speaker.say(B.v.announce(caregiver, store));
    // Annonce unique à l'arrivée sur l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- Actions -------------------------------- */

  const selectTier = useCallback(
    (t: BasketTier) => {
      if (phase.name !== 'choosing') return;
      dispatch({ type: 'SELECT_TIER', tier: t });
      speaker.stop();
      void speaker.say(B.v.tierSelected(t, store));
    },
    [phase.name, speaker, B, store],
  );

  /** Relecture finale ; un appui sur « Arrêter la lecture » l'interrompt (retour au choix). */
  const startReadback = useCallback(() => {
    if (tier === null || phase.name !== 'choosing' || items.length === 0) return;
    const text = B.v.readback(tier, items, caregiver, store);
    speaker.stop();
    dispatch({ type: 'START_READBACK', startedAt: nowIso(), text, items });
    void speaker.say(text, { interruptible: false }).then((outcome) => {
      if (!mounted.current) return;
      dispatch(outcome === 'completed' ? { type: 'READBACK_DONE', completedAt: nowIso() } : { type: 'READBACK_INTERRUPTED' });
    });
  }, [tier, phase.name, items, B, caregiver, store, speaker]);

  const firstConfirm = useCallback(
    (method: 'voice' | 'tap') => {
      if (phase.name !== 'awaiting_first') return;
      dispatch({ type: 'FIRST_CONFIRM', confirmation: { method, at: nowIso() } });
      void speaker.say(B.v.armLongPress);
    },
    [phase.name, speaker, B],
  );

  const cancel = useCallback(() => {
    speaker.stop();
    dispatch({ type: 'CANCEL' });
    void speaker.say(B.v.cancelled);
  }, [speaker, B]);

  const secondConfirm = useCallback(
    (outcome: LongPressOutcome | { readonly method: 'voice' }) => {
      if (phase.name !== 'armed') return;
      const at = nowIso();
      dispatch({
        type: 'SECOND_CONFIRM',
        listId,
        items,
        key: newIdempotencyKey(),
        locale,
        confirmation:
          outcome.method === 'long_press' ? { method: 'long_press', durationMs: outcome.durationMs, at } : { method: outcome.method, at },
      });
    },
    [phase.name, listId, items, locale],
  );

  /* ----------------------- Transmission au serveur ---------------------- */

  useEffect(() => {
    if (phase.name !== 'sending') return;
    let active = true;
    void speaker.say(B.v.sending(caregiver));
    void backend.submitHandoff(phase.request, phase.key).then(async (result) => {
      if (!active || !mounted.current) return;
      if (result.ok) {
        dispatch({ type: 'SUBMIT_OK', response: result.value });
        const r = result.value;
        onHandoffSent(r);
        await speaker.say(
          r.smsStatus === 'sent' ? B.v.sent(r.caregiverFirstName) : r.smsStatus === 'opted_out' ? B.v.sentOptedOut(r.caregiverFirstName) : B.v.sentPending(r.caregiverFirstName),
        );
      } else {
        dispatch({ type: 'SUBMIT_FAILED', error: result.error });
        await speaker.say(B.v.failure(result.error.kind, result.error.code, caregiver));
      }
    });
    return () => {
      active = false;
    };
    // Déclenché à chaque nouvel objet `sending` (premier envoi ou « Réessayer »).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* --------------------------- Réponses vocales -------------------------- */

  const onIntent = useCallback(
    (intent: VoiceIntent | null) => {
      if (!intent) {
        void speaker.say(S.voice.notUnderstood);
        return;
      }
      switch (intent.kind) {
        case 'repeat':
          speaker.repeat();
          return;
        case 'choose_tier':
          selectTier(intent.tier);
          return;
        case 'choose_candidate': {
          const t = BASKET_TIERS[intent.rank - 1];
          if (t) selectTier(t);
          return;
        }
        case 'yes':
          if (phase.name === 'choosing') startReadback();
          else if (phase.name === 'awaiting_first') firstConfirm('voice');
          return;
        // « Oui, je commande » ne vaut jamais deux confirmations à la fois :
        // avant l'armement, il compte comme le premier « oui » seulement.
        case 'confirm_order':
          if (phase.name === 'awaiting_first') firstConfirm('voice');
          else if (phase.name === 'armed') secondConfirm({ method: 'voice' });
          return;
        case 'no':
        case 'cancel':
        case 'none_matched':
          if (phase.name === 'choosing') onBackToList();
          else if (phase.name !== 'sending' && phase.name !== 'sent') cancel();
          return;
      }
    },
    [phase.name, speaker, S, selectTier, startReadback, firstConfirm, secondConfirm, cancel, onBackToList],
  );

  const voice = useVoiceAnswer(speech, locale, onIntent, () => speaker.stop());

  /* -------------------------------- Rendu ------------------------------- */

  if (phase.name === 'sent') {
    const r = phase.response;
    return (
      <SafeAreaView style={[theme.baseStyles.screen, styles.sent]}>
        <View style={styles.sentBody} accessible accessibilityRole="alert">
          <T style={[typography.display, styles.center]} importantForAccessibility="no">
            ✓
          </T>
          <T style={[typography.title, styles.center]}>{B.sentTitle}</T>
          <T style={[typography.body, styles.center]}>
            {r.smsStatus === 'sent' ? B.v.sent(r.caregiverFirstName) : r.smsStatus === 'opted_out' ? B.v.sentOptedOut(r.caregiverFirstName) : B.v.sentPending(r.caregiverFirstName)}
          </T>
        </View>
        <BigButton label={B.backToList} accessibilityHint={B.backToListHint} onPress={onBackToList} />
      </SafeAreaView>
    );
  }

  const choosing = phase.name === 'choosing';
  // Récapitulatif en haut de la zone qui défile : il peut être long (texte agrandi à 200 %).
  const readbackText =
    phase.name === 'reading_back' ? phase.text : phase.name === 'awaiting_first' || phase.name === 'armed' ? phase.readback.text : null;

  return (
    <SafeAreaView style={theme.baseStyles.screen}>
      <View style={styles.header}>
        <BigButton label={S.common.back} variant="secondary" accessibilityHint={B.backHint} disabled={!choosing} onPress={onBackToList} />
        <T style={[typography.title, styles.headerTitle]} accessibilityRole="header">
          {B.title}
        </T>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {readbackText ? (
          <View style={styles.readback} accessible accessibilityRole="summary" accessibilityLabel={`${B.readbackTitle}. ${readbackText}`}>
            <T style={typography.label}>{B.readbackTitle}</T>
            <T style={typography.body}>{readbackText}</T>
          </View>
        ) : null}
        {store ? <T style={typography.body}>{B.preferredStore(store, caregiver)}</T> : null}

        <View accessibilityRole="radiogroup" accessibilityLabel={B.choiceGroup} style={styles.cards}>
          {BASKET_TIERS.map((t, i) => (
            <TierCard
              key={t}
              tier={t}
              index={i}
              count={BASKET_TIERS.length}
              store={store}
              selected={t === tier}
              selectable={choosing}
              onSelect={() => selectTier(t)}
            />
          ))}
        </View>

        <T style={[typography.caption, styles.secondary]}>{B.noPrices(caregiver)}</T>
        <BigButton label={B.why} variant="secondary" accessibilityHint={B.whyHint} onPress={() => void speaker.say(B.v.whyNoPrice(caregiver))} />
      </ScrollView>

      <Footer
        S={S}
        phase={phase}
        tier={tier}
        caregiver={caregiver}
        listening={voice.listening}
        heard={voice.heard}
        onSpeak={voice.toggle}
        onContinue={startReadback}
        onStopReadback={() => speaker.stop()}
        onFirstConfirm={() => firstConfirm('tap')}
        onSecondConfirm={secondConfirm}
        onCancel={cancel}
        onRepeat={speaker.repeat}
        onHoldStart={() => speaker.stop()}
        onReleasedEarly={() => void speaker.say(B.v.holdReleasedTooEarly)}
        onRetry={() => dispatch({ type: 'RETRY' })}
        onBackToList={onBackToList}
      />
    </SafeAreaView>
  );
};

/* -------------------------------------------------------------------------- */
/* Pied d'écran : une seule décision à la fois                                */
/* -------------------------------------------------------------------------- */

interface FooterProps {
  readonly S: Strings;
  readonly phase: Exclude<BasketPhase, { readonly name: 'sent' }>;
  readonly tier: BasketTier | null;
  readonly caregiver: string;
  readonly listening: boolean;
  readonly heard: string;
  readonly onSpeak: () => void;
  readonly onContinue: () => void;
  readonly onStopReadback: () => void;
  readonly onFirstConfirm: () => void;
  readonly onSecondConfirm: (o: LongPressOutcome) => void;
  readonly onCancel: () => void;
  readonly onRepeat: () => void;
  readonly onHoldStart: () => void;
  readonly onReleasedEarly: () => void;
  readonly onRetry: () => void;
  readonly onBackToList: () => void;
}

const Footer: React.FC<FooterProps> = (p) => {
  const { phase, S } = p;
  const B = S.basket;
  const retryable = phase.name === 'failed' && ['offline', 'timeout', 'server', 'rate_limited'].includes(phase.error.kind);

  return (
    <View style={styles.footer}>
      {phase.name === 'choosing' ? (
        <BigButton
          label={p.tier ? B.continueWith(p.tier) : B.chooseFirst}
          accessibilityHint={B.continueHint}
          disabled={!p.tier}
          onPress={p.onContinue}
        />
      ) : null}

      {phase.name === 'reading_back' ? (
        <BigButton label={B.stopReading} variant="secondary" accessibilityHint={B.stopReadingHint} onPress={p.onStopReadback} />
      ) : null}

      {phase.name === 'awaiting_first' ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <BigButton label={B.change} variant="secondary" accessibilityHint={B.changeHint} onPress={p.onCancel} />
          </View>
          <View style={styles.flex}>
            <BigButton label={B.confirmYes} accessibilityHint={B.confirmYesHint} onPress={p.onFirstConfirm} />
          </View>
        </View>
      ) : null}

      {phase.name === 'armed' ? (
        <>
          <LongPressConfirmButton
            label={B.order}
            sublabel={B.orderSub(p.caregiver)}
            enabled
            accessibilityHint={B.orderHint}
            onHoldStart={p.onHoldStart}
            onReleasedEarly={p.onReleasedEarly}
            onConfirmed={p.onSecondConfirm}
          />
          <BigButton label={B.cancelOrder} variant="secondary" accessibilityHint={B.cancelOrderHint} onPress={p.onCancel} />
        </>
      ) : null}

      {phase.name === 'sending' ? (
        <View style={styles.sending} accessible accessibilityRole="progressbar" accessibilityLabel={B.sendingLabel(p.caregiver)} accessibilityState={{ busy: true }}>
          <ActivityIndicator size="large" color={colors.text} />
          <T style={typography.bodyBold}>{B.sendingLabel(p.caregiver)}</T>
        </View>
      ) : null}

      {phase.name === 'failed' ? (
        <>
          <View style={styles.info} accessible accessibilityLiveRegion="polite" accessibilityRole="alert">
            <T style={[typography.bodyBold, { color: colors.infoText }]}>{B.v.failure(phase.error.kind, phase.error.code, p.caregiver)}</T>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <BigButton label={B.backToList} variant="secondary" accessibilityHint={B.keptHint} onPress={p.onBackToList} />
            </View>
            {retryable ? (
              <View style={styles.flex}>
                <BigButton label={S.common.retry} accessibilityHint={B.retryHint} onPress={p.onRetry} />
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {phase.name !== 'sending' ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <BigButton
              label={p.listening ? B.listening : B.speak}
              variant="secondary"
              accessibilityHint={B.speakHint}
              disabled={phase.name === 'reading_back'}
              onPress={p.onSpeak}
            />
          </View>
          <View style={styles.flex}>
            <BigButton label={S.common.repeat} variant="secondary" accessibilityHint={S.common.repeatHint} onPress={p.onRepeat} />
          </View>
        </View>
      ) : null}
      {p.listening && p.heard ? (
        <T style={[typography.caption, styles.center]} accessibilityLiveRegion="polite">
          « {p.heard} »
        </T>
      ) : null}
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  headerTitle: { flex: 1 },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  cards: { gap: spacing.md },
  secondary: { color: colors.textSecondary },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderTopWidth: theme.borderWidth.card,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  readback: { backgroundColor: colors.offlineBackground, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  sending: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  info: { backgroundColor: colors.infoBackground, borderRadius: radius.card, padding: spacing.md },
  sent: { justifyContent: 'space-between', padding: spacing.md },
  sentBody: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.successBackground,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  center: { textAlign: 'center' },
});

export default BasketScreen;
