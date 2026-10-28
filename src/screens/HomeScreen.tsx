/**
 * Écran d'accueil — « Ma liste » (cahier V3.0 §2 étapes 1 à 6, §3.2 ; avenant Canada CA-2, CA-4).
 *
 *   ┌──────────────────────────────────────┐
 *   │ Vocourse                 [🔒 Aidant] │  barre du haut
 *   │ Bonjour Jeanne !                      │  salutation, alignée à gauche
 *   │ Que souhaitez-vous ajouter à votre    │
 *   │ épicerie aujourd'hui ?                │
 *   │            ((( 🎤 )))                 │  micro central, halo soleil / ondes
 *   │ ✓ Produit ajouté !                    │  état en mots + symbole
 *   │   2 cartons de lait 2 %               │
 *   │ [question de doute, s'il y en a une]  │
 *   │ Ma liste (3 produits)                 │
 *   │ ┌ 🥛 Lait 2 %, 2 L   [−] 2 [+] [✕] ┐ │  cartes produit
 *   │ Pas de prix ici : Paul verra le montant│  (Instacart fait foi)
 *   ├──────────────────────────────────────┤
 *   │ [Lait retiré.  Annuler]               │  10 s pour annuler
 *   │ [🎤] [Répète] [C'est bon]             │  pied fixe ; petit micro si le grand est hors écran
 *   └──────────────────────────────────────┘
 *
 * Écran présentationnel : état et actions viennent d'App.tsx.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DisambiguationAnswer, ItemId, MicState, ShoppingList } from '../types/vocourse';
import { canValidateList, isConfirmed, isPendingChoice } from '../types/vocourse';
import { useReduceMotion } from '../hooks/useAccessibilityPrefs';
import { useStrings } from '../i18n';
import { homeStatus } from './home/homeModel';
import { AccessibleText as T } from '../components/AccessibleText';
import { BigButton } from '../components/BigButton';
import { LockIcon, MicIcon } from '../components/icons';
import { MicHero } from '../components/home/MicHero';
import { ItemCard } from '../components/home/ItemCard';
import { DoubtCard } from '../components/home/DoubtCard';
import { borderWidth, colors, radius, spacing, theme, touchTarget, typography } from '../theme/theme';

export interface JustAdded {
  readonly ids: readonly ItemId[];
  readonly labels: readonly string[];
}

export interface LastRemoved {
  readonly itemId: ItemId;
  readonly label: string;
}

export interface HomeScreenProps {
  readonly list: ShoppingList;
  readonly micState: MicState;
  readonly partialText: string;
  readonly isOnline: boolean;
  readonly justAdded: JustAdded | null;
  readonly lastRemoved: LastRemoved | null;
  readonly seniorFirstName: string | null;
  readonly caregiverFirstName: string | null;

  readonly onMicPress: () => void;
  readonly onChangeQuantity: (itemId: ItemId, quantity: number) => void;
  readonly onRemoveItem: (itemId: ItemId) => void;
  readonly onUndoRemove: () => void;
  readonly onAnswerDisambiguation: (itemId: ItemId, answer: DisambiguationAnswer) => void;
  /** « C'est bon » : choix du panier et envoi (écran B). */
  readonly onValidateList: () => void;
  readonly onRepeat: () => void;
  /** Bouton « Aidant » : code PIN puis réglages. */
  readonly onCaregiverAccess: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = (p) => {
  const S = useStrings();
  const reduceMotion = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const heroBottom = useRef(Number.POSITIVE_INFINITY);
  const [heroHidden, setHeroHidden] = useState(false);

  const confirmed = useMemo(() => p.list.items.filter(isConfirmed), [p.list.items]);
  const doubt = useMemo(() => p.list.items.find(isPendingChoice) ?? null, [p.list.items]);
  const canValidate = canValidateList(p.list);
  const highlighted = useMemo(() => new Set(p.justAdded?.ids ?? []), [p.justAdded]);

  const greeting = S.home.greeting(new Date().getHours(), p.seniorFirstName, confirmed.length > 0);
  const status = homeStatus(
    {
      micState: p.micState,
      isOnline: p.isOnline,
      hasDoubt: doubt !== null,
      justAdded: p.justAdded?.labels ?? null,
      partialText: p.partialText,
      itemCount: confirmed.length,
      queuedCount: p.list.offlineQueuedCount,
    },
    S,
  );

  /* Petit micro du pied d'écran : visible seulement quand le grand est sorti de l'écran. */
  const onHeroLayout = useCallback((e: LayoutChangeEvent) => {
    heroBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height * 0.6;
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setHeroHidden(e.nativeEvent.contentOffset.y > heroBottom.current);
  }, []);
  const onCompactMic = useCallback(() => {
    scroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
    p.onMicPress();
  }, [p, reduceMotion]);

  const validateHint = doubt ? S.home.validateHintDoubt : confirmed.length === 0 ? S.home.validateHintEmpty : S.home.validateHintReady;

  return (
    <SafeAreaView style={theme.baseStyles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
      >
        {/* ----------------------------- Haut ----------------------------- */}
        <View style={styles.topBar}>
          <T style={[typography.bodyBold, styles.brand]} accessibilityRole="header">
            {S.home.brand}
          </T>
          <Pressable
            onPress={p.onCaregiverAccess}
            accessible
            accessibilityRole="button"
            accessibilityLabel={S.home.caregiverA11y}
            accessibilityHint={S.home.caregiverHint}
            style={({ pressed }) => [styles.caregiver, pressed && styles.caregiverPressed]}
          >
            <LockIcon size={22} color={colors.textSecondary} />
            <T style={[typography.caption, styles.caregiverLabel]} importantForAccessibility="no">
              {S.home.caregiverButton}
            </T>
          </Pressable>
        </View>

        <View style={styles.greeting}>
          <T style={typography.greeting} accessibilityRole="header">
            {greeting.title}
          </T>
          <T style={typography.body}>{greeting.subtitle}</T>
        </View>

        {/* ----------------------------- Micro ---------------------------- */}
        <View onLayout={onHeroLayout}>
          <MicHero micState={p.micState} status={status} reduceMotion={reduceMotion} onPress={p.onMicPress} />
        </View>

        {/* ---------------------- Question ou liste ----------------------- */}
        {doubt ? <DoubtCard item={doubt} onAnswer={p.onAnswerDisambiguation} /> : null}

        {confirmed.length > 0 ? (
          <View style={styles.section}>
            <T style={typography.title} accessibilityRole="header">
              {S.home.myList(confirmed.length)}
            </T>
            {confirmed.map((item) => (
              <ItemCard
                key={item.itemId}
                item={item}
                highlighted={highlighted.has(item.itemId)}
                onChangeQuantity={p.onChangeQuantity}
                onRemove={p.onRemoveItem}
              />
            ))}
            <T style={[typography.caption, styles.secondary]}>{S.home.noPricesNote(p.caregiverFirstName)}</T>
          </View>
        ) : !doubt ? (
          <View style={styles.example} accessible accessibilityRole="text">
            <T style={typography.bodyBold}>{S.home.exampleTitle}</T>
            <T style={typography.choice}>{S.home.example}</T>
            <T style={[typography.body, styles.secondary]}>{S.home.severalTimes}</T>
          </View>
        ) : null}
      </ScrollView>

      {/* ------------------------------ Pied ------------------------------ */}
      <View style={styles.footer}>
        {p.lastRemoved ? (
          <View style={styles.undo} accessible={false}>
            <T
              style={[typography.bodyBold, styles.flex]}
              accessibilityLiveRegion="polite"
              accessibilityRole="text"
            >
              {S.home.removedBanner(p.lastRemoved.label)}
            </T>
            <Pressable
              onPress={p.onUndoRemove}
              accessible
              accessibilityRole="button"
              accessibilityLabel={S.home.undoA11y(p.lastRemoved.label)}
              accessibilityHint={S.home.undoHint}
              style={({ pressed }) => [styles.undoButton, pressed && styles.caregiverPressed]}
            >
              <T style={typography.bodyBold} importantForAccessibility="no">
                {S.home.undo}
              </T>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footerRow}>
          {heroHidden ? (
            <Pressable
              onPress={onCompactMic}
              accessible
              accessibilityRole="button"
              accessibilityLabel={p.micState === 'listening' || p.micState === 'offline_recording' ? S.home.micStop : S.home.micSpeak}
              accessibilityHint={S.home.micCompactHint}
              style={({ pressed }) => [
                styles.compactMic,
                (p.micState === 'listening' || p.micState === 'offline_recording') && styles.compactMicListening,
                pressed && styles.compactMicPressed,
              ]}
            >
              <MicIcon size={36} color={colors.actionText} />
            </Pressable>
          ) : null}
          <BigButton label={S.common.repeat} variant="secondary" accessibilityHint={S.common.repeatHint} onPress={p.onRepeat} />
          <View style={styles.flex}>
            <BigButton
              label={S.home.validate}
              accessibilityHint={validateHint}
              disabled={!canValidate}
              onPress={p.onValidateList}
            />
          </View>
        </View>
        {!canValidate && confirmed.length + (doubt ? 1 : 0) > 0 ? (
          <T style={[typography.caption, styles.footerHint]} importantForAccessibility="no">
            {validateHint}
          </T>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  secondary: { color: colors.textSecondary },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },
  brand: { color: colors.actionOnBackground },
  caregiver: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
  },
  caregiverPressed: { backgroundColor: colors.offlineBackground, borderColor: colors.borderStrong },
  caregiverLabel: { color: colors.textSecondary },
  greeting: { gap: spacing.xs },
  section: { gap: spacing.md },
  example: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  footer: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: borderWidth.card,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xs,
    paddingLeft: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.waitingTint,
  },
  undoButton: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  compactMic: {
    width: touchTarget.micCompact,
    height: touchTarget.micCompact,
    borderRadius: touchTarget.micCompact / 2,
    backgroundColor: colors.actionBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactMicListening: { backgroundColor: colors.listening },
  compactMicPressed: { backgroundColor: colors.actionBackgroundPressed },
  footerHint: { textAlign: 'center' },
});

export default HomeScreen;
