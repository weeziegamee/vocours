/**
 * Composants de formulaire accessibles (WCAG 2.2 AAA) pour l'espace aidant.
 * - Libellé toujours visible au-dessus du champ (pas de texte d'exemple seul).
 * - Cibles ≥ 64 dp, texte ≥ 20, agrandissement système jusqu'à 200 %.
 * - Erreur annoncée par un symbole et un texte, jamais par la couleur seule,
 *   et reprise dans l'indice lu par le lecteur d'écran.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AccessibleText as T } from './AccessibleText';
import { useStrings } from '../i18n';
import { borderWidth, colors, fontSize, MAX_FONT_SCALE, radius, spacing, touchTarget, typography } from '../theme/theme';

/* -------------------------------------------------------------------------- */
/* Champ de saisie                                                            */
/* -------------------------------------------------------------------------- */

type PassThrough = Pick<
  TextInputProps,
  'keyboardType' | 'autoComplete' | 'textContentType' | 'autoCapitalize' | 'maxLength' | 'autoCorrect'
>;

export interface FormFieldProps extends PassThrough {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly hint?: string;
  readonly error?: string;
  readonly optional?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({ label, value, onChangeText, hint, error, optional, ...input }) => {
  const [focused, setFocused] = useState(false);
  const S = useStrings();
  const spokenHint = [error ? `${S.common.errorPrefix} : ${error}` : null, hint ?? null].filter(Boolean).join('. ');
  return (
    <View style={styles.field}>
      <T style={typography.label} importantForAccessibility="no">
        {label}
        {optional ? ` (${S.common.optional})` : ''}
      </T>
      {hint ? (
        <T style={[typography.caption, styles.hint]} importantForAccessibility="no">
          {hint}
        </T>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={optional ? `${label}, ${S.common.optional}` : label}
        {...(spokenHint ? { accessibilityHint: spokenHint } : {})}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null]}
        {...input}
      />
      {error ? (
        <T style={[typography.bodyBold, styles.error]} importantForAccessibility="no">
          ⚠ {error}
        </T>
      ) : null}
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Choix unique                                                               */
/* -------------------------------------------------------------------------- */

export interface RadioOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly hint?: string;
}

export interface RadioGroupProps<V extends string> {
  readonly label: string;
  readonly options: readonly RadioOption<V>[];
  readonly value: V | null;
  readonly onChange: (v: V) => void;
  readonly error?: string;
}

export const RadioGroup = <V extends string>({ label, options, value, onChange, error }: RadioGroupProps<V>) => {
  const S = useStrings();
  return (
  <View style={styles.field}>
    <T style={typography.label} accessibilityRole="header">
      {label}
    </T>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessible
            accessibilityRole="radio"
            accessibilityLabel={`${o.label}, ${S.common.ofN(i + 1, options.length)}`}
            {...(o.hint ? { accessibilityHint: o.hint } : {})}
            accessibilityState={{ checked }}
            style={({ pressed }) => [styles.option, checked && styles.optionChecked, pressed && styles.optionPressed]}
          >
            {/* Symbole + graisse : l'état ne dépend pas de la couleur. */}
            <T style={typography.title} importantForAccessibility="no">
              {checked ? '◉' : '○'}
            </T>
            <View style={styles.flex}>
              <T style={checked ? typography.bodyBold : typography.body} importantForAccessibility="no">
                {o.label}
              </T>
              {o.hint ? (
                <T style={[typography.caption, styles.hint]} importantForAccessibility="no">
                  {o.hint}
                </T>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
    {error ? <T style={[typography.bodyBold, styles.error]}>⚠ {error}</T> : null}
  </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Interrupteur et case à cocher                                              */
/* -------------------------------------------------------------------------- */

export interface ToggleRowProps {
  readonly label: string;
  readonly description: string;
  readonly value: boolean;
  readonly onChange: (v: boolean) => void;
  readonly kind?: 'switch' | 'checkbox';
  readonly error?: string;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, value, onChange, kind = 'switch', error }) => {
  const S = useStrings();
  return (
  <View style={styles.field}>
    <Pressable
      onPress={() => onChange(!value)}
      accessible
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityHint={error ? `${S.common.errorPrefix} : ${error}. ${description}` : description}
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [styles.toggle, pressed && styles.optionPressed]}
    >
      <View style={styles.flex}>
        <T style={typography.bodyBold} importantForAccessibility="no">
          {label}
        </T>
        <T style={[typography.caption, styles.hint]} importantForAccessibility="no">
          {description}
        </T>
      </View>
      <View style={[styles.box, value && styles.boxOn]} importantForAccessibility="no-hide-descendants">
        <T style={value ? typography.action : typography.bodyBold}>
          {kind === 'checkbox' ? (value ? '✓' : ' ') : value ? S.common.yes : S.common.no}
        </T>
      </View>
    </Pressable>
    {error ? <T style={[typography.bodyBold, styles.error]}>⚠ {error}</T> : null}
  </View>
  );
};

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  flex: { flex: 1 },
  hint: { color: colors.textSecondary },
  input: {
    minHeight: touchTarget.min,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputFocused: { borderWidth: borderWidth.emphasis },
  inputError: { borderWidth: borderWidth.emphasis, borderStyle: 'dashed' },
  error: { color: colors.text },
  group: { gap: spacing.md },
  option: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  optionChecked: { borderWidth: borderWidth.emphasis, backgroundColor: colors.successBackground },
  optionPressed: { backgroundColor: colors.offlineBackground },
  toggle: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  box: {
    minWidth: touchTarget.min,
    minHeight: 48,
    borderRadius: radius.button,
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  boxOn: { backgroundColor: colors.actionBackground, borderColor: colors.actionBackground },
});
