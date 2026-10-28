/**
 * Question de levée de doute : 3 grandes cartes au plus, un seul doute à la fois
 * (cahier V3.0 §2 étape 5). Les cartes sont numérotées parce que le senior peut
 * répondre à la voix « le premier », « le deuxième »…
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DisambiguationAnswer, ItemId, PendingChoiceItem } from '../../types/vocourse';
import { pictogramFor } from '../../screens/home/homeModel';
import { AccessibleText as T } from '../AccessibleText';
import { useStrings } from '../../i18n';
import { borderWidth, colors, radius, spacing, touchTarget, typography } from '../../theme/theme';

export interface DoubtCardProps {
  readonly item: PendingChoiceItem;
  readonly onAnswer: (itemId: ItemId, answer: DisambiguationAnswer) => void;
}

export const DoubtCard: React.FC<DoubtCardProps> = ({ item, onAnswer }) => {
  const S = useStrings();
  const { candidates, ttsPrompt } = item.disambiguation;
  return (
    <View style={styles.card}>
      <T style={typography.title} accessibilityRole="header">
        {ttsPrompt}
      </T>
      <T style={typography.caption}>{S.doubt.speakHint}</T>
      <View style={styles.choices}>
        {candidates.map((c) => (
          <Pressable
            key={c.rank}
            onPress={() => onAnswer(item.itemId, { kind: 'candidate', rank: c.rank, method: 'tap' })}
            accessible
            accessibilityRole="button"
            accessibilityLabel={S.doubt.choiceA11y(c.rank, candidates.length, c.label)}
            accessibilityHint={S.doubt.choiceHint}
            style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
          >
            <View style={styles.rank} importantForAccessibility="no-hide-descendants">
              <T style={typography.bodyBold}>{c.rank}</T>
            </View>
            <T style={styles.pictogram} importantForAccessibility="no">
              {pictogramFor(c.category)}
            </T>
            <T style={[typography.choice, styles.flex]} importantForAccessibility="no">
              {c.label}
            </T>
          </Pressable>
        ))}
        <Pressable
          onPress={() => onAnswer(item.itemId, { kind: 'none_matched' })}
          accessible
          accessibilityRole="button"
          accessibilityLabel={S.doubt.none}
          accessibilityHint={S.doubt.noneHint}
          style={({ pressed }) => [styles.none, pressed && styles.choicePressed]}
        >
          <T style={typography.bodyBold} importantForAccessibility="no">
            {S.doubt.none}
          </T>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.waitingTint,
    borderRadius: radius.card,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  choices: { gap: spacing.md },
  choice: {
    minHeight: touchTarget.choiceCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  choicePressed: { borderWidth: borderWidth.emphasis, borderColor: colors.borderStrong, backgroundColor: colors.successBackground },
  rank: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictogram: { fontSize: 34, lineHeight: 44 },
  flex: { flex: 1 },
  none: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
});

export default DoubtCard;
