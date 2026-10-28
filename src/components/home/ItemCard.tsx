/**
 * Carte d'un produit de la liste.
 *
 *   ┌─────────────────────────────────────────┐
 *   │ (🥛)  Lait 2 %, 2 L                      │
 *   │       2 cartons                          │
 *   │  [ − ]   2   [ + ]          [ ✕ Retirer ] │
 *   └─────────────────────────────────────────┘
 *
 * Boutons de 64 × 64 dp (au-delà des 48 dp demandés), espacés de 16 dp. Le nom et la
 * quantité sont lus d'un seul tenant ; chaque bouton nomme le produit qu'il touche.
 * Aucun élément interactif imbriqué dans un conteneur accessible.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ConfirmedItem, ItemId } from '../../types/vocourse';
import { MAX_QUANTITY, MIN_QUANTITY } from '../../state/listReducer';
import { pictogramFor } from '../../screens/home/homeModel';
import { AccessibleText as T } from '../AccessibleText';
import { useStrings } from '../../i18n';
import { borderWidth, colors, radius, spacing, touchTarget, typography } from '../../theme/theme';

export interface ItemCardProps {
  readonly item: ConfirmedItem;
  /** Produit tout juste ajouté : fond vert pâle quelques secondes. */
  readonly highlighted: boolean;
  readonly onChangeQuantity: (itemId: ItemId, quantity: number) => void;
  readonly onRemove: (itemId: ItemId) => void;
}

const RoundButton: React.FC<{
  readonly glyph: string;
  readonly label: string;
  readonly hint: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}> = ({ glyph, label, hint, disabled, onPress }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessible
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityHint={hint}
    accessibilityState={{ disabled }}
    hitSlop={spacing.xs / 2}
    style={({ pressed }) => [styles.stepButton, disabled && styles.stepDisabled, pressed && styles.pressed]}
  >
    <T style={styles.glyph} importantForAccessibility="no">
      {glyph}
    </T>
  </Pressable>
);

export const ItemCard: React.FC<ItemCardProps> = ({ item, highlighted, onChangeQuantity, onRemove }) => {
  const S = useStrings();
  const F = S.format;
  const name = F.shortName(item.productLabel);
  const atMin = item.quantity <= MIN_QUANTITY;
  const atMax = item.quantity >= MAX_QUANTITY;

  return (
    <View style={[styles.card, highlighted && styles.cardHighlighted]}>
      <View style={styles.top} accessible accessibilityRole="text" accessibilityLabel={F.itemSpoken(item)}>
        <View style={styles.bubble} importantForAccessibility="no-hide-descendants">
          <T style={styles.pictogram}>{pictogramFor(item.category)}</T>
        </View>
        <View style={styles.names}>
          <T style={typography.bodyBold} importantForAccessibility="no">
            {item.productLabel}
          </T>
          <T style={[typography.body, styles.secondary]} importantForAccessibility="no">
            {F.quantityWithUnit(item.quantity, item.unit)}
          </T>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.stepper}>
          <RoundButton
            glyph="−"
            label={S.item.less(name)}
            hint={atMin ? S.item.minHint : S.item.currentHint(F.quantity(item.quantity))}
            disabled={atMin}
            onPress={() => onChangeQuantity(item.itemId, item.quantity - 1)}
          />
          <T style={[typography.display, styles.qty]} importantForAccessibility="no">
            {F.quantity(item.quantity)}
          </T>
          <RoundButton
            glyph="+"
            label={S.item.more(name)}
            hint={atMax ? S.item.maxHint(MAX_QUANTITY) : S.item.currentHint(F.quantity(item.quantity))}
            disabled={atMax}
            onPress={() => onChangeQuantity(item.itemId, item.quantity + 1)}
          />
        </View>

        <Pressable
          onPress={() => onRemove(item.itemId)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={S.item.removeA11y(name)}
          accessibilityHint={S.item.removeHint}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <T style={typography.bodyBold} importantForAccessibility="no">
            {S.item.remove}
          </T>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHighlighted: { backgroundColor: colors.successBackground, borderColor: colors.actionBackground },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictogram: { fontSize: 30, lineHeight: 40 },
  names: { flex: 1 },
  secondary: { color: colors.textSecondary },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: { borderStyle: 'dashed', backgroundColor: colors.surface },
  glyph: { fontSize: 36, lineHeight: 42, fontWeight: '700', color: colors.text },
  qty: { minWidth: 48, textAlign: 'center' },
  // Toujours calé à droite (même passé à la ligne) : loin du « − » et du « + ».
  remove: {
    marginLeft: 'auto',
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.offlineBackground, borderColor: colors.borderStrong },
});

export default ItemCard;
