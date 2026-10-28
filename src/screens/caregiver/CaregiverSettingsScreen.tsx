/**
 * Espace aidant — réglages (cahier V3.0 §6.2 ; avenant Canada CA-1.3, CA-1.4, CA-5).
 *
 * Personne aidée, aidant (prénom, cellulaire confirmé par texto, consentement aux textos),
 * adresse de livraison partout au Canada (province déduite du code postal), épicerie
 * préférée parmi celles qu'Instacart dessert à cette adresse, langue et voix, code de
 * l'aidant, et confidentialité (politique, export, suppression du compte).
 *
 * Accessibilité : libellés visibles, erreurs listées en tête et sous chaque champ (symbole
 * + texte), annonce du nombre de champs à corriger, cibles ≥ 64 dp, texte jusqu'à 200 %.
 * Sécurité : fermeture après 3 min d'inactivité, modifications non enregistrées abandonnées.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppLocale, CaregiverSettings, CaregiverStatus, IsoDateTime, Result, Retailer, VoiceRegister } from '../../types/vocourse';
import { FIELD_ORDER, checkPostalCode, formFromSettings, validateSettingsForm, type SettingsErrors, type SettingsForm } from '../../services/caregiver/settings';
import { AccessibleText as T } from '../../components/AccessibleText';
import { BigButton } from '../../components/BigButton';
import { FormField, RadioGroup, ToggleRow, type RadioOption } from '../../components/form';
import { useInactivityTimeout } from '../../hooks/useInactivityTimeout';
import { useStrings } from '../../i18n';
import { colors, radius, spacing, theme, typography } from '../../theme/theme';

export type RetailersState =
  | { readonly kind: 'need_address' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly list: readonly Retailer[] };

export interface CaregiverSettingsScreenProps {
  readonly mode: 'setup' | 'edit';
  readonly initial: CaregiverSettings | null;
  readonly defaultLanguage: AppLocale;
  readonly intro?: string;
  readonly status: CaregiverStatus | null;
  readonly retailers: RetailersState;
  /** Enregistre (serveur puis stockage chiffré). Renvoie un message lisible en cas d'échec. */
  readonly onSave: (settings: CaregiverSettings) => Promise<Result<void, string>>;
  readonly onClose: () => void;
  readonly onChangePin: () => void;
  readonly onVerifyMobile: () => void;
  readonly onOpenPrivacy: () => void;
  readonly onExport: () => Promise<Result<void, string>>;
  readonly onDelete: () => Promise<Result<void, string>>;
  readonly onReloadRetailers: () => void;
  /** Reconnaissance vocale en ligne (Apple / Google) si le téléphone ne sait pas le faire seul. */
  readonly cloudSpeech: boolean;
  readonly platform: 'ios' | 'android';
  readonly onCloudSpeechChange: (allowed: boolean) => Promise<Result<void, string>>;
  readonly now?: () => IsoDateTime;
}

const INACTIVITY_MS = 3 * 60 * 1000;
const NO_PREFERENCE = '__none__';

const defaultNow = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

export const CaregiverSettingsScreen: React.FC<CaregiverSettingsScreenProps> = (props) => {
  const { mode, initial, defaultLanguage, status: verifyStatus, retailers, onSave, onClose, now = defaultNow } = props;
  const S = useStrings();
  const C = S.settings;
  const initialForm = useMemo(() => formFromSettings(initial, defaultLanguage), [initial, defaultLanguage]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'failed'; text?: string }>({ kind: 'idle' });
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const scroll = useRef<ScrollView>(null);

  const resetInactivity = useInactivityTimeout(onClose, INACTIVITY_MS);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  const set = useCallback(<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key as keyof SettingsErrors];
      return next;
    });
    setStatus((s) => (s.kind === 'saved' || s.kind === 'failed' ? { kind: 'idle' } : s));
  }, []);

  const errorText = (f: keyof SettingsErrors): string | undefined => {
    const k = errors[f];
    return k ? C.errors[k] : undefined;
  };
  const err = (f: keyof SettingsErrors): { error: string } | Record<string, never> => {
    const e = errorText(f);
    return e ? { error: e } : {};
  };
  const errorList = FIELD_ORDER.filter((f) => errors[f] !== undefined);

  const save = useCallback(async () => {
    resetInactivity();
    const result = validateSettingsForm(form, now());
    if (!result.ok) {
      setErrors(result.error);
      const fields = FIELD_ORDER.filter((f) => result.error[f] !== undefined);
      scroll.current?.scrollTo({ y: 0, animated: false });
      AccessibilityInfo.announceForAccessibility(C.errorsA11y(fields.length, fields.map((f) => C.fields[f])));
      return;
    }
    setErrors({});
    setStatus({ kind: 'saving' });
    const saved = await onSave(result.value);
    if (saved.ok) {
      setStatus({ kind: 'saved', text: mode === 'setup' ? C.savedShort : C.saved });
      AccessibilityInfo.announceForAccessibility(C.savedShort);
    } else {
      setStatus({ kind: 'failed', text: saved.error });
      AccessibilityInfo.announceForAccessibility(saved.error);
    }
  }, [form, now, onSave, resetInactivity, C, mode]);

  const close = useCallback(() => {
    if (!dirty || status.kind === 'saved') {
      onClose();
      return;
    }
    Alert.alert(C.discardTitle, C.discardBody, [
      { text: C.keepEditing, style: 'cancel' },
      { text: C.discard, style: 'destructive', onPress: onClose },
    ]);
  }, [dirty, status.kind, onClose, C]);

  const confirmDelete = useCallback(() => {
    Alert.alert(C.deleteTitle, C.deleteBody, [
      { text: S.common.cancel, style: 'cancel' },
      {
        text: C.deleteConfirm,
        style: 'destructive',
        onPress: () => {
          setBusy('delete');
          void props.onDelete().then((r) => {
            setBusy(null);
            if (!r.ok) setStatus({ kind: 'failed', text: r.error });
          });
        },
      },
    ]);
  }, [C, S, props]);

  const doExport = useCallback(() => {
    resetInactivity();
    setBusy('export');
    void props.onExport().then((r) => {
      setBusy(null);
      if (!r.ok) setStatus({ kind: 'failed', text: r.error });
    });
  }, [props, resetInactivity]);

  const postal = checkPostalCode(form.postalCode);
  const french = form.language === 'fr-CA';

  const languageOptions: readonly RadioOption<AppLocale>[] = [
    { value: 'fr-CA', label: C.languages['fr-CA'] },
    { value: 'en-CA', label: C.languages['en-CA'] },
  ];
  const registerOptions: readonly RadioOption<VoiceRegister>[] = [
    { value: 'vous', label: C.registerVous, hint: C.registerVousHint },
    { value: 'tu', label: C.registerTu, hint: C.registerTuHint },
  ];
  const retailerOptions: readonly RadioOption<string>[] =
    retailers.kind === 'ok'
      ? [{ value: NO_PREFERENCE, label: C.noPreference }, ...retailers.list.map((r) => ({ value: r.key, label: r.name }))]
      : [];
  // Une enseigne déjà choisie reste proposée même si Instacart ne la renvoie plus.
  const currentRetailer = form.preferredRetailer;
  const retailerChoices =
    currentRetailer && retailers.kind === 'ok' && !retailers.list.some((r) => r.key === currentRetailer.key)
      ? [...retailerOptions, { value: currentRetailer.key, label: currentRetailer.name }]
      : retailerOptions;

  return (
    <SafeAreaView style={theme.baseStyles.screen} onTouchStart={resetInactivity}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <T style={[typography.title, styles.flex]} accessibilityRole="header">
            {mode === 'setup' ? C.setupTitle : C.title}
          </T>
        </View>

        <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {props.intro ? <T style={typography.bodyBold}>{props.intro}</T> : null}

          {errorList.length > 0 ? (
            <View style={styles.errorSummary} accessible accessibilityRole="alert">
              <T style={typography.bodyBold}>{C.errorsCount(errorList.length)}</T>
              {errorList.map((f) => (
                <T key={f} style={typography.body}>
                  • {C.fields[f]}
                </T>
              ))}
            </View>
          ) : null}

          {status.kind === 'saved' || status.kind === 'failed' ? (
            <View
              style={[styles.banner, status.kind === 'failed' && styles.errorSummary]}
              accessible
              accessibilityRole={status.kind === 'failed' ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
            >
              <T style={typography.bodyBold}>
                {status.kind === 'saved' ? '✓ ' : '⚠ '}
                {status.text}
              </T>
            </View>
          ) : null}

          {/* ------------------------- Personne aidée ------------------------- */}
          <T style={typography.title} accessibilityRole="header">
            {C.sectionSenior}
          </T>
          <FormField
            label={C.fields.seniorFirstName}
            optional
            value={form.seniorFirstName}
            onChangeText={(v) => set('seniorFirstName', v)}
            hint={C.hints.seniorFirstName}
            autoCapitalize="words"
            maxLength={40}
            {...err('seniorFirstName')}
          />

          {/* ----------------------------- Aidant ----------------------------- */}
          <T style={typography.title} accessibilityRole="header">
            {C.sectionCaregiver}
          </T>
          <FormField
            label={C.fields.caregiverFirstName}
            value={form.caregiverFirstName}
            onChangeText={(v) => set('caregiverFirstName', v)}
            hint={C.hints.caregiverFirstName}
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
            maxLength={40}
            {...err('caregiverFirstName')}
          />
          <FormField
            label={C.fields.caregiverMobile}
            value={form.caregiverMobile}
            onChangeText={(v) => set('caregiverMobile', v)}
            hint={C.hints.caregiverMobile}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={16}
            {...err('caregiverMobile')}
          />
          {mode === 'edit' && verifyStatus ? (
            <View style={styles.verify}>
              <T style={typography.bodyBold} accessibilityLiveRegion="polite">
                {verifyStatus.caregiverOptedOut ? C.mobileOptedOut : verifyStatus.caregiverMobileVerified ? C.mobileVerified : C.mobileUnverified}
              </T>
              {!verifyStatus.caregiverMobileVerified || verifyStatus.caregiverOptedOut ? (
                <BigButton label={C.verifyNow} variant="secondary" onPress={props.onVerifyMobile} disabled={dirty} />
              ) : null}
            </View>
          ) : null}
          <ToggleRow
            kind="checkbox"
            label={C.smsConsentLabel}
            description={C.smsConsentDescription}
            value={form.smsConsent}
            onChange={(v) => set('smsConsent', v)}
            {...err('smsConsent')}
          />

          {/* ---------------------- Adresse de livraison ---------------------- */}
          <T style={typography.title} accessibilityRole="header">
            {C.sectionAddress}
          </T>
          <View style={styles.row}>
            <View style={styles.half}>
              <FormField
                label={C.fields.civicNumber}
                value={form.civicNumber}
                onChangeText={(v) => set('civicNumber', v)}
                autoCapitalize="characters"
                maxLength={7}
                {...err('civicNumber')}
              />
            </View>
            <View style={styles.half}>
              <FormField
                label={C.fields.apartment}
                optional
                value={form.apartment}
                onChangeText={(v) => set('apartment', v)}
                autoCapitalize="characters"
                maxLength={10}
                {...err('apartment')}
              />
            </View>
          </View>
          <FormField
            label={C.fields.street}
            value={form.street}
            onChangeText={(v) => set('street', v)}
            hint={C.hints.street}
            autoComplete="street-address"
            textContentType="streetAddressLine1"
            maxLength={80}
            {...err('street')}
          />
          <FormField
            label={C.fields.city}
            value={form.city}
            onChangeText={(v) => set('city', v)}
            autoComplete="postal-address-locality"
            textContentType="addressCity"
            autoCapitalize="words"
            maxLength={60}
            {...err('city')}
          />
          <FormField
            label={C.fields.postalCode}
            value={form.postalCode}
            onChangeText={(v) => set('postalCode', v.toUpperCase())}
            hint={C.hints.postalCode}
            autoComplete="postal-code"
            textContentType="postalCode"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            {...err('postalCode')}
          />
          <T style={typography.body} accessibilityLiveRegion="polite">
            {C.provinceLine(postal.ok ? S.format.province(postal.province) : null)}
          </T>

          {/* ------------------------- Épicerie ------------------------------- */}
          <T style={typography.title} accessibilityRole="header">
            {C.sectionStore}
          </T>
          {retailers.kind === 'ok' && retailerChoices.length > 1 ? (
            <RadioGroup
              label={C.fields.preferredRetailer}
              options={retailerChoices}
              value={form.preferredRetailer?.key ?? NO_PREFERENCE}
              onChange={(key) => {
                const r = retailerChoices.find((o) => o.value === key);
                set('preferredRetailer', key === NO_PREFERENCE || !r ? null : { key, name: r.label });
              }}
            />
          ) : (
            <View style={styles.banner}>
              <T style={typography.body}>
                {retailers.kind === 'loading'
                  ? C.retailersLoading
                  : retailers.kind === 'failed'
                    ? C.retailersFailed
                    : retailers.kind === 'need_address'
                      ? C.retailersNeedAddress
                      : C.retailersNone}
              </T>
              {retailers.kind === 'failed' ? <BigButton label={S.common.retry} variant="secondary" onPress={props.onReloadRetailers} /> : null}
            </View>
          )}
          <T style={[typography.caption, styles.note]}>{C.storeNote}</T>

          {/* ------------------------- Langue et voix ------------------------- */}
          <T style={typography.title} accessibilityRole="header">
            {C.sectionVoice}
          </T>
          <RadioGroup label={C.fields.language} options={languageOptions} value={form.language} onChange={(v) => set('language', v)} />
          {french ? (
            <>
              <RadioGroup label={C.registerGroup} options={registerOptions} value={form.register} onChange={(v) => set('register', v)} />
              <ToggleRow
                label={C.fields.regionalDictionary}
                description={C.regionalDescription}
                value={form.regionalDictionary}
                onChange={(v) => set('regionalDictionary', v)}
              />
            </>
          ) : null}

          {mode === 'edit' ? (
            <>
              {/* -------------------------- Sécurité ------------------------------ */}
              <T style={typography.title} accessibilityRole="header">
                {C.sectionSecurity}
              </T>
              <BigButton label={C.changePin} variant="secondary" accessibilityHint={C.changePinHint} onPress={props.onChangePin} />

              {/* ------------------------ Confidentialité ------------------------- */}
              <T style={typography.title} accessibilityRole="header">
                {C.sectionPrivacy}
              </T>
              <BigButton label={C.privacyPolicy} variant="secondary" accessibilityHint={S.onboarding.privacyLinkHint} onPress={props.onOpenPrivacy} />
              <ToggleRow
                label={S.onboarding.cloudSpeechLabel}
                description={S.onboarding.cloudSpeechDescription(props.platform)}
                value={props.cloudSpeech}
                onChange={(v) => {
                  resetInactivity();
                  void props.onCloudSpeechChange(v).then((r) => {
                    if (!r.ok) setStatus({ kind: 'failed', text: r.error });
                  });
                }}
              />
              <BigButton label={C.exportData} variant="secondary" accessibilityHint={C.exportHint} disabled={busy !== null} onPress={doExport} />
              <BigButton label={C.deleteAccount} variant="secondary" accessibilityHint={C.deleteHint} disabled={busy !== null} onPress={confirmDelete} />
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {mode === 'edit' ? (
            <View style={styles.flex}>
              <BigButton label={S.common.close} variant="secondary" accessibilityHint={C.closeHint} onPress={close} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <BigButton
              label={status.kind === 'saving' ? S.common.saving : mode === 'setup' ? C.next : S.common.save}
              accessibilityHint={C.saveHint}
              disabled={status.kind === 'saving'}
              onPress={() => void save()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  half: { flexGrow: 1, flexBasis: 140 },
  note: { color: colors.textSecondary },
  verify: { gap: spacing.xs },
  errorSummary: { backgroundColor: colors.infoBackground, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  banner: { backgroundColor: colors.successBackground, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: theme.borderWidth.card,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});

export default CaregiverSettingsScreen;
