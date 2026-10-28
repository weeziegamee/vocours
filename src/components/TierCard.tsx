/**
 * Carte d'une gamme de panier (Économique, Équilibré, Bio), sans montant : les prix
 * exacts sont ceux qu'Instacart affichera à l'aidant. Bouton radio accessible ; l'état
 * choisi est montré par un symbole et un texte, pas seulement par la couleur.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BasketTier } from '../types/vocourse';
import { AccessibleText as T } from './AccessibleText';
import { useStrings } from '../i18n';
import { borderWidth, colors, radius, spacing, touchTarget, typography } from '../theme/theme';

const GLYPH: Readonly<Record<BasketTier, string>> = { economy: '💲', balanced: '⚖️', premium_organic: '🌱' };

export interface TierCardProps {
  readonly tier: BasketTier;
  readonly index: number;
  readonly count: number;
  readonly store: string | null;
  readonly selected: boolean;
  readonly selectable: boolean;
  readonly onSelect: () => void;
}

export const TierCard: React.FC<TierCardProps> = ({ tier, index, count, store, selected, selectable, onSelect }) => {
  const S = useStrings();
  const description = S.format.tierDescription(tier, store);
  return (
    <Pressable
      onPress={onSelect}
      disabled={!selectable}
      accessible
      accessibilityRole="radio"
      accessibilityLabel={S.basket.tierA11y(index + 1, count, tier, description, selected)}
      accessibilityHint={S.basket.tierHint}
      accessibilityState={{ checked: selected, disabled: !selectable }}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <T style={styles.glyph} importantForAccessibility="no">
        {GLYPH[tier]}
      </T>
      <View style={styles.text}>
        <T style={typography.title} importantForAccessibility="no">
          {S.format.tierLabel(tier)}
        </T>
        <T style={typography.body} importantForAccessibility="no">
          {description}
        </T>
        {selected ? (
          <T style={[typography.bodyBold, styles.check]} importantForAccessibility="no">
            {S.basket.selected}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    minHeight: touchTarget.choiceCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
  },
  selected: { borderWidth: borderWidth.emphasis, borderColor: colors.actionBackground, backgroundColor: colors.successBackground },
  pressed: { borderColor: colors.borderStrong },
  glyph: { fontSize: 34, lineHeight: 44 },
  text: { flex: 1, gap: spacing.xs },
  check: { color: colors.actionOnBackground },
});

export default TierCard;
