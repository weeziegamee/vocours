/**
 * Bouton géant accessible : ≥ 80 dp, état désactivé expliqué par le libellé et
 * la bordure pointillée (pas par une couleur pâle), texte sur vert en 24 gras.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AccessibleText as T } from './AccessibleText';
import { borderWidth, colors, radius, spacing, touchTarget, typography } from '../theme/theme';

export interface BigButtonProps {
  readonly label: string;
  readonly accessibilityHint?: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary';
  readonly disabled?: boolean;
}

export const BigButton: React.FC<BigButtonProps> = ({
  label,
  accessibilityHint,
  onPress,
  variant = 'primary',
  disabled = false,
}) => {
  const primary = variant === 'primary' && !disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
      ]}
    >
      <T style={primary ? typography.action : typography.bodyBold} importantForAccessibility="no">
        {label}
      </T>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.footerButton,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.actionBackground },
  primaryPressed: { backgroundColor: colors.actionBackgroundPressed },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
  },
  secondaryPressed: { borderWidth: borderWidth.emphasis, backgroundColor: colors.successBackground },
  disabled: {
    backgroundColor: colors.disabledBackground,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
});

export default BigButton;
