/**
 * Point d'entrée de Vocourse — orchestration des écrans.
 *
 *   Premier lancement (aidant) : langue → consentement → code de l'aidant → réglages →
 *   confirmation du cellulaire → « Tout est prêt ».
 *
 *   Parcours du senior (2 écrans) :
 *   Écran A « Ma liste » ──(C'est bon)──▶ Écran B « Mon panier » ──▶ texto à l'aidant
 *        ▲                                                │
 *        └──────────── Retour / nouvelle liste ───────────┘
 *
 *   Espace aidant (bouton « Aidant », code PIN) : réglages, cellulaire, code oublié,
 *   confidentialité (export, suppression du compte).
 *
 * Les services (serveur, dictée, voix, réseau, stockage) sont injectés : réels ou
 * simulés selon `env.mode`.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Share, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type {
  AppLocale,
  CaregiverSettings,
  CaregiverStatus,
  ConfirmedItem,
  DisambiguationAnswer,
  IdempotencyKey,
  InterpretResponse,
  ItemId,
  Result,
  UserId,
  VerificationPurpose,
} from './types/vocourse';
import { isConfirmed, isPendingChoice } from './types/vocourse';
import type { AppEnv } from './config/env';
import { RUNTIME_ENV } from './config/runtimeEnv';
import { createServices, type Services } from './services/createServices';
import { useShoppingList } from './hooks/useShoppingList';
import { useDictation } from './hooks/useDictation';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useSpeaker } from './hooks/useSpeaker';
import { clampQuantity } from './state/listReducer';
import { HomeScreen, type JustAdded, type LastRemoved } from './screens/HomeScreen';
import { BasketScreen } from './screens/BasketScreen';
import { OnboardingScreen, type OnboardingStep } from './screens/OnboardingScreen';
import { PinGateScreen } from './screens/caregiver/PinGateScreen';
import { CaregiverSettingsScreen, type RetailersState } from './screens/caregiver/CaregiverSettingsScreen';
import { VerifyCodeScreen } from './screens/caregiver/VerifyCodeScreen';
import { createPinVault, PIN_STORE_KEY } from './services/security/pinVault';
import { describeChanges, loadSettings, saveSettings, SETTINGS_STORE_KEY } from './services/caregiver/settings';
import { loadSetup, saveSetup, wipeDevice, type SetupState } from './services/storage/persistence';
import { parseVoiceIntent } from './services/voice/intents';
import { normalizeWord } from '../shared/nlp/interpret.ts';
import { StringsContext, stringsFor } from './i18n';
import { colors, theme } from './theme/theme';
import { newIdempotencyKey, nowIso } from './utils/ids';

/** Absence tolérée pendant un partage ou la lecture de la politique (espace aidant). */
const EXTERNAL_GRACE_MS = 2 * 60_000;

type Route =
  | { readonly name: 'boot' }
  | { readonly name: 'onboarding'; readonly step: OnboardingStep }
  | { readonly name: 'setup_pin' }
  | { readonly name: 'setup_settings' }
  | { readonly name: 'setup_verify' }
  | { readonly name: 'list' }
  | { readonly name: 'basket'; readonly sent: boolean }
  /* Espace aidant : hors du parcours senior (2 écrans), protégé par code PIN. */
  | { readonly name: 'caregiver_pin'; readonly purpose: 'unlock' | 'change' | 'reset' }
  | { readonly name: 'caregiver_settings' }
  | { readonly name: 'caregiver_verify'; readonly purpose: VerificationPurpose };

export interface AppProps {
  readonly env?: AppEnv;
  /** Injection pour les tests ; sinon construits depuis `env`. */
  readonly services?: Services;
}

const USER_ID = 'usr_local' as UserId;

const routeForSetup = (s: SetupState | null): Route => {
  if (!s) return { name: 'onboarding', step: 'language' };
  switch (s.step) {
    case 'registered':
      return { name: 'setup_pin' };
    case 'pin':
      return { name: 'setup_settings' };
    case 'settings':
      return { name: 'setup_verify' };
    case 'done':
      return { name: 'list' };
  }
};

const Root: React.FC<AppProps> = ({ env = RUNTIME_ENV, services: injected }) => {
  const services = useMemo(() => injected ?? createServices(env), [injected, env]);
  const { backend, session, speech, tts, network, secureStore, platform } = services;
  const pinVault = useMemo(() => createPinVault({ store: secureStore }), [secureStore]);

  const [route, setRoute] = useState<Route>({ name: 'boot' });
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [settings, setSettings] = useState<CaregiverSettings | null>(null);
  const [chosenLocale, setChosenLocale] = useState<AppLocale | null>(null);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [caregiverStatus, setCaregiverStatus] = useState<CaregiverStatus | null>(null);
  const [retailers, setRetailers] = useState<RetailersState>({ kind: 'loading' });

  const locale: AppLocale = settings?.language ?? setup?.locale ?? chosenLocale ?? 'fr-CA';
  const register = settings?.register ?? 'vous';
  const S = useMemo(() => stringsFor(locale, register), [locale, register]);

  useEffect(() => {
    tts.setLocale(locale);
    speech.setLocale(locale);
  }, [locale, tts, speech]);
  useEffect(() => speech.setCloudAllowed(setup?.consent.cloudSpeech ?? false), [setup, speech]);

  /* ------------------------------ Démarrage ------------------------------ */

  useEffect(() => {
    let active = true;
    void (async () => {
      const [s, cfg] = await Promise.all([loadSetup(secureStore), loadSettings(secureStore)]);
      if (!active) return;
      setSetup(s);
      setSettings(cfg);
      setRoute(routeForSetup(s));
    })();
    const off = session.onLost(() => setRoute({ name: 'onboarding', step: 'session_lost' }));
    return () => {
      active = false;
      off();
    };
  }, [secureStore, session]);

  const advanceSetup = useCallback(
    async (step: SetupState['step']) => {
      if (!setup) return;
      const next = { ...setup, step };
      await saveSetup(secureStore, next);
      setSetup(next);
    },
    [setup, secureStore],
  );

  /* ------------------------------- Senior -------------------------------- */

  const pendingAnnouncement = useRef<string | null>(null);
  const isOnline = useNetworkStatus(network);
  const speaker = useSpeaker(tts);
  const shopping = useShoppingList(USER_ID, secureStore, locale);
  const { list, confirmedItems, currentDoubt } = shopping;

  /** « Produit ajouté ! » sous le micro et cartes surlignées, pendant 4 s. */
  const [justAdded, setJustAdded] = useState<JustAdded | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAdded = useCallback(
    (items: readonly ConfirmedItem[]) => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
      setJustAdded({ ids: items.map((i) => i.itemId), labels: items.map(S.format.itemSpoken) });
      addedTimer.current = setTimeout(() => setJustAdded(null), theme.timing.addedFeedbackMs);
    },
    [S],
  );

  /** Dernier produit retiré, que l'on peut remettre pendant 10 s. */
  const [lastRemoved, setLastRemoved] = useState<LastRemoved | null>(null);
  const removedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Annonce groupée après une série d'appuis sur + ou − (une seule phrase). */
  const quantityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      [addedTimer, removedTimer, quantityTimer].forEach((t) => {
        if (t.current) clearTimeout(t.current);
      });
    },
    [],
  );

  /**
   * Résultats arrivés hors de « Ma liste » (analyse lancée juste avant d'ouvrir le panier ou
   * l'espace aidant) : gardés et ajoutés au retour, pour ne jamais modifier une liste en cours
   * de relecture ou d'envoi.
   */
  const routeRef = useRef(route);
  useLayoutEffect(() => {
    routeRef.current = route;
  }, [route]);
  const heldResults = useRef<InterpretResponse[]>([]);

  const applyInterpretation = useCallback(
    (r: InterpretResponse) => {
      shopping.addInterpretation(r);
      const noted = r.items.filter(isConfirmed);
      const doubt = r.items.find(isPendingChoice);
      if (noted.length > 0) showAdded(noted);
      void (async () => {
        if (noted.length > 0) await speaker.say(S.voice.noted(noted));
        // La question du doute est posée par l'effet ci-dessous, une fois affichée.
        if (noted.length === 0 && !doubt) await speaker.say(S.voice.nothingHeard);
      })();
    },
    [shopping, speaker, S, showAdded],
  );

  const onInterpreted = useCallback(
    (r: InterpretResponse) => {
      if (routeRef.current.name !== 'list') heldResults.current.push(r);
      else applyInterpretation(r);
    },
    [applyInterpretation],
  );

  useEffect(() => {
    if (route.name !== 'list' || heldResults.current.length === 0) return;
    const held = heldResults.current;
    heldResults.current = [];
    held.forEach(applyInterpretation);
  }, [route.name, applyInterpretation]);

  const onAnswerDisambiguation = useRef<(itemId: ItemId, answer: DisambiguationAnswer) => void>(() => undefined);

  /** Une question est affichée : « le deuxième », « aucun » ou le nom d'un des choix y répondent. */
  const interceptFinal = useCallback(
    (text: string): boolean => {
      const doubt = currentDoubt;
      if (!doubt) return false;
      // Seule une réponse courte répond à la question ; « deux litres de lait et du pain »
      // est une nouvelle dictée, même si elle contient le nom d'un des choix.
      const words = text.trim().split(/\s+/).filter((w) => w !== '').length;
      if (words > 5) return false;
      const intent = words <= 3 ? parseVoiceIntent(text, locale) : null;
      if (intent?.kind === 'none_matched') {
        onAnswerDisambiguation.current(doubt.itemId, { kind: 'none_matched' });
        return true;
      }
      const said = ` ${normalizeWord(text)} `;
      const byName = doubt.disambiguation.candidates.find((c) => said.includes(` ${normalizeWord(S.format.shortName(c.label))} `));
      const rank = byName?.rank ?? (intent?.kind === 'choose_candidate' && intent.rank <= doubt.disambiguation.candidates.length ? intent.rank : null);
      if (rank === null) return false;
      onAnswerDisambiguation.current(doubt.itemId, { kind: 'candidate', rank, method: 'voice' });
      return true;
    },
    [currentDoubt, locale, S],
  );

  const dictation = useDictation({
    speech,
    backend,
    speaker,
    store: secureStore,
    isOnline,
    locale,
    register,
    regionalDictionary: settings?.regionalDictionary ?? locale === 'fr-CA',
    strings: S,
    onInterpreted,
    onQueueChanged: shopping.setQueuedCount,
    interceptFinal,
    paused: route.name !== 'list' && route.name !== 'boot',
  });
  const resetDictation = dictation.reset;

  /* Accueil vocal, une fois par lancement, à la première arrivée sur « Ma liste ». */
  const welcomed = useRef(false);
  useEffect(() => {
    if (route.name !== 'list' || welcomed.current || !shopping.hydrated) return;
    welcomed.current = true;
    void speaker.say(S.voice.welcome(settings?.seniorFirstName ?? null));
  }, [route.name, shopping.hydrated, speaker, S, settings]);

  /* Chaque nouveau doute affiché est posé à voix haute, après les phrases en cours. */
  const askedDoubt = useRef<ItemId | null>(null);
  useEffect(() => {
    if (!currentDoubt || askedDoubt.current === currentDoubt.itemId || route.name !== 'list') return;
    askedDoubt.current = currentDoubt.itemId;
    void speaker.say(currentDoubt.disambiguation.ttsPrompt);
  }, [currentDoubt, route.name, speaker]);

  useLayoutEffect(() => {
    onAnswerDisambiguation.current = (itemId, answer) => {
      const item = list.items.find((i) => i.itemId === itemId);
      shopping.resolveDoubt(itemId, answer);
      if (answer.kind === 'none_matched') {
        void speaker.say(S.voice.redictate).then(() => dictation.startListening());
        return;
      }
      const chosen = item && isPendingChoice(item) ? item.disambiguation.candidates.find((c) => c.rank === answer.rank) : undefined;
      if (chosen) void speaker.say(S.voice.doubtResolved(chosen.label));
    };
  }, [list.items, shopping, speaker, S, dictation]);
  const answerDoubt = useCallback((itemId: ItemId, answer: DisambiguationAnswer) => onAnswerDisambiguation.current(itemId, answer), []);

  const onRemoveItem = useCallback(
    (itemId: ItemId) => {
      const item = confirmedItems.find((i) => i.itemId === itemId);
      shopping.removeItem(itemId);
      if (!item) return;
      if (removedTimer.current) clearTimeout(removedTimer.current);
      setLastRemoved({ itemId, label: item.productLabel });
      removedTimer.current = setTimeout(() => setLastRemoved(null), theme.timing.undoRemoveMs);
      void speaker.say(S.voice.removed(item.productLabel));
    },
    [confirmedItems, shopping, speaker, S],
  );

  const onUndoRemove = useCallback(() => {
    if (!lastRemoved) return;
    if (removedTimer.current) clearTimeout(removedTimer.current);
    shopping.restoreItem(lastRemoved.itemId);
    setLastRemoved(null);
    speaker.stop();
    void speaker.say(S.voice.restored(lastRemoved.label));
  }, [lastRemoved, shopping, speaker, S]);

  const onChangeQuantity = useCallback(
    (itemId: ItemId, quantity: number) => {
      const item = confirmedItems.find((i) => i.itemId === itemId);
      if (!item) return;
      const next = clampQuantity(quantity);
      shopping.setQuantity(itemId, next);
      if (quantityTimer.current) clearTimeout(quantityTimer.current);
      quantityTimer.current = setTimeout(() => {
        speaker.stop();
        void speaker.say(S.voice.quantityChanged({ ...item, quantity: next }));
      }, theme.timing.quantitySpeakDelayMs);
    },
    [confirmedItems, shopping, speaker, S],
  );

  const backToList = useCallback(() => {
    const wasSent = route.name === 'basket' && route.sent;
    setRoute({ name: 'list' });
    if (wasSent) {
      shopping.reset();
      setLastRemoved(null);
      setJustAdded(null);
      askedDoubt.current = null;
      void speaker.say(S.voice.newList);
    }
  }, [route, shopping, speaker, S]);

  const onHandoffSent = useCallback(() => {
    shopping.markSent();
    setRoute((r) => (r.name === 'basket' ? { ...r, sent: true } : r));
  }, [shopping]);

  /* ----------------------------- Espace aidant --------------------------- */

  const refreshCaregiverStatus = useCallback(async () => {
    const r = await backend.caregiverStatus();
    if (r.ok) setCaregiverStatus(r.value);
  }, [backend]);

  const loadRetailers = useCallback(async () => {
    const r = await backend.nearbyRetailers();
    setRetailers(r.ok ? { kind: 'ok', list: r.value } : r.error.code === 'setup_incomplete' ? { kind: 'need_address' } : { kind: 'failed' });
  }, [backend]);

  /* À l'ouverture des réglages : état du cellulaire et épiceries proches. */
  useEffect(() => {
    if (route.name !== 'caregiver_settings' && route.name !== 'setup_settings') return;
    if (!settings) return;
    let active = true;
    void backend.caregiverStatus().then((r) => {
      if (active && r.ok) setCaregiverStatus(r.value);
    });
    void backend.nearbyRetailers().then((r) => {
      if (active) setRetailers(r.ok ? { kind: 'ok', list: r.value } : r.error.code === 'setup_incomplete' ? { kind: 'need_address' } : { kind: 'failed' });
    });
    return () => { active = false; };
  }, [route.name, settings, backend]);

  const onCaregiverAccess = useCallback(() => {
    speaker.stop();
    speech.stop();
    setRoute({ name: 'caregiver_pin', purpose: 'unlock' });
  }, [speaker, speech]);

  const onPinLockout = useCallback(() => {
    void backend.sendAlert({ kind: 'pin_lockout' });
  }, [backend]);

  /**
   * Sortie voulue par l'aidant (feuille de partage de l'export, politique dans le navigateur) :
   * l'espace aidant n'est pas refermé à ce moment-là, sauf absence de plus de 2 minutes.
   */
  const externalSince = useRef<number | null>(null);
  const leaveForExternal = useCallback(() => {
    externalSince.current = Date.now();
  }, []);

  const openPrivacy = useCallback(() => {
    leaveForExternal();
    void Linking.openURL(env.privacyPolicyUrl[locale]).catch(() => {
      externalSince.current = null;
    });
  }, [env, locale, leaveForExternal]);

  const saveCaregiverSettings = useCallback(
    async (next: CaregiverSettings): Promise<Result<void, string>> => {
      const N = stringsFor(next.language, next.register).settings;
      // Serveur d'abord : le téléphone et le serveur ne doivent jamais diverger.
      const saved = await backend.saveCaregiverSettings(next, newIdempotencyKey() as IdempotencyKey);
      if (!saved.ok) return { ok: false, error: saved.error.kind === 'offline' || saved.error.kind === 'timeout' ? N.saveOffline : N.saveFailed };
      await saveSettings(secureStore, next);
      const changes = describeChanges(settings, next);
      if (changes.length > 0) {
        pendingAnnouncement.current = stringsFor(next.language, next.register).voice.settingsChanged(next.caregiverFirstName, changes);
        void backend.sendAlert({ kind: 'settings_changed' });
      }
      setSettings(next);
      setCaregiverStatus((s) => ({
        settingsSaved: true,
        caregiverMobileVerified: saved.value.caregiverMobileVerified,
        caregiverOptedOut: s?.caregiverOptedOut ?? false,
      }));
      return { ok: true, value: undefined };
    },
    [backend, secureStore, settings],
  );

  const closeCaregiverArea = useCallback(() => {
    setRoute({ name: 'list' });
    const announcement = pendingAnnouncement.current;
    pendingAnnouncement.current = null;
    if (announcement) void speaker.say(announcement);
  }, [speaker]);

  /** Efface tout ce qui est gardé sur le téléphone et revient au premier lancement. */
  const resetDevice = useCallback(async () => {
    await resetDictation();
    heldResults.current = [];
    await wipeDevice(secureStore, [PIN_STORE_KEY, SETTINGS_STORE_KEY]);
    await session.forget();
    shopping.reset();
    setSettings(null);
    setSetup(null);
    setChosenLocale(null);
    setCaregiverStatus(null);
    welcomed.current = false;
    setRoute({ name: 'onboarding', step: 'language' });
  }, [secureStore, session, shopping, resetDictation]);

  const deleteAccount = useCallback(async (): Promise<Result<void, string>> => {
    const r = await backend.deleteAccount();
    // Déjà supprimé côté serveur (appareil inconnu) : on efface quand même le téléphone.
    if (!r.ok && r.error.kind !== 'unauthorized') return { ok: false, error: S.settings.deleteFailed };
    await resetDevice();
    return { ok: true, value: undefined };
  }, [backend, resetDevice, S]);

  const changeCloudSpeech = useCallback(
    async (allowed: boolean): Promise<Result<void, string>> => {
      if (!setup) return { ok: false, error: S.settings.saveFailed };
      const consent = { ...setup.consent, acceptedAt: nowIso(), cloudSpeech: allowed };
      const r = await backend.updateConsent(consent);
      if (!r.ok) return { ok: false, error: r.error.kind === 'offline' || r.error.kind === 'timeout' ? S.settings.saveOffline : S.settings.saveFailed };
      const next = { ...setup, consent };
      await saveSetup(secureStore, next);
      setSetup(next);
      return { ok: true, value: undefined };
    },
    [setup, backend, secureStore, S],
  );

  const exportAccount = useCallback(async (): Promise<Result<void, string>> => {
    const r = await backend.exportAccount();
    if (!r.ok) return { ok: false, error: S.settings.exportFailed };
    leaveForExternal();
    try {
      await Share.share({ title: S.settings.exportData, message: JSON.stringify(r.value, null, 2) });
    } finally {
      externalSince.current = null;
    }
    return { ok: true, value: undefined };
  }, [backend, S, leaveForExternal]);

  /*
   * Appli mise en arrière-plan pendant que l'espace aidant est ouvert : on le referme,
   * pour qu'il ne soit jamais retrouvé déverrouillé (code à ressaisir).
   */
  const inCaregiverArea = route.name === 'caregiver_pin' || route.name === 'caregiver_settings' || route.name === 'caregiver_verify';
  useEffect(() => {
    if (!inCaregiverArea) return;
    externalSince.current = null; // sortie d'avant l'ouverture de l'espace aidant : sans effet
    const sub = AppState.addEventListener('change', (state) => {
      const since = externalSince.current;
      if (since === null) {
        if (state !== 'active') closeCaregiverArea();
        return;
      }
      if (state === 'active') {
        externalSince.current = null;
        if (Date.now() - since > EXTERNAL_GRACE_MS) closeCaregiverArea();
      }
    });
    return () => sub.remove();
  }, [inCaregiverArea, closeCaregiverArea]);

  /* -------------------------- Premier lancement -------------------------- */

  const acceptConsent = useCallback(
    async (cloudSpeech: boolean) => {
      setOnboardingBusy(true);
      setOnboardingError(null);
      const consent = { version: env.privacyPolicyVersion, acceptedAt: nowIso(), cloudSpeech };
      const r = await backend.registerDevice({ locale, platform, consent });
      setOnboardingBusy(false);
      if (!r.ok) {
        setOnboardingError(r.error.kind === 'offline' || r.error.kind === 'timeout' ? S.onboarding.needsInternet : S.onboarding.registerFailed);
        return;
      }
      await session.start(
        { deviceId: r.value.deviceId, deviceSecret: r.value.deviceSecret },
        { accessToken: r.value.accessToken, expiresIn: r.value.expiresIn },
      );
      const next: SetupState = { locale, consent, step: 'registered' };
      await saveSetup(secureStore, next);
      setSetup(next);
      setRoute({ name: 'setup_pin' });
    },
    [backend, env, locale, platform, session, secureStore, S],
  );

  /* -------------------------------- Rendu -------------------------------- */

  const caregiverName = settings?.caregiverFirstName ?? (locale === 'fr-CA' ? 'votre proche' : 'your caregiver');

  const screen = ((): React.ReactElement => {
    switch (route.name) {
      case 'boot':
        return (
          <SafeAreaView style={[theme.baseStyles.screen, styles.center]}>
            <ActivityIndicator size="large" color={colors.text} />
          </SafeAreaView>
        );

      case 'onboarding':
        return (
          <OnboardingScreen
            step={route.step}
            platform={platform}
            busy={onboardingBusy}
            error={onboardingError}
            seniorFirstName={settings?.seniorFirstName ?? null}
            onChooseLanguage={(l) => {
              setChosenLocale(l);
              setRoute({ name: 'onboarding', step: 'consent' });
            }}
            onAccept={(cloud) => void acceptConsent(cloud)}
            onOpenPrivacy={openPrivacy}
            onDone={() => setRoute({ name: 'list' })}
            onRestart={() => void resetDevice()}
          />
        );

      case 'setup_pin':
        return (
          <PinGateScreen
            vault={pinVault}
            purpose="create"
            intro={S.onboarding.stepPin}
            onSuccess={() => {
              void advanceSetup('pin');
              setRoute({ name: 'setup_settings' });
            }}
            onCancel={() => undefined}
            onLockout={onPinLockout}
          />
        );

      case 'setup_settings':
        return (
          <CaregiverSettingsScreen
            mode="setup"
            intro={S.onboarding.stepSettings}
            initial={settings}
            defaultLanguage={locale}
            status={caregiverStatus}
            retailers={settings ? retailers : { kind: 'need_address' }}
            onSave={async (next) => {
              const r = await saveCaregiverSettings(next);
              if (r.ok) {
                pendingAnnouncement.current = null;
                await advanceSetup('settings');
                setRoute({ name: 'setup_verify' });
              }
              return r;
            }}
            onClose={() => undefined}
            onChangePin={() => undefined}
            onVerifyMobile={() => undefined}
            onOpenPrivacy={openPrivacy}
            onExport={async () => ({ ok: true, value: undefined })}
            onDelete={async () => ({ ok: true, value: undefined })}
            onReloadRetailers={() => {
              setRetailers({ kind: 'loading' });
              void loadRetailers();
            }}
            cloudSpeech={setup?.consent.cloudSpeech ?? false}
            platform={platform}
            onCloudSpeechChange={async () => ({ ok: true, value: undefined })}
          />
        );

      case 'setup_verify':
        return (
          <VerifyCodeScreen
            purpose="mobile"
            backend={backend}
            intro={S.onboarding.stepVerify}
            skipLabel={S.verify.later}
            skipHint={S.verify.laterHint}
            onVerified={() => {
              void advanceSetup('done');
              setRoute({ name: 'onboarding', step: 'done' });
            }}
            onSkip={() => {
              void advanceSetup('done');
              setRoute({ name: 'onboarding', step: 'done' });
            }}
          />
        );

      case 'caregiver_pin':
        return (
          <PinGateScreen
            key={route.purpose}
            vault={pinVault}
            purpose={route.purpose}
            onForgot={() => setRoute({ name: 'caregiver_verify', purpose: 'pin_reset' })}
            onSuccess={() => setRoute({ name: 'caregiver_settings' })}
            // Seul un aidant déjà authentifié (« change ») revient aux réglages ; abandonner
            // un déverrouillage ou une réinitialisation referme l'espace aidant.
            onCancel={() => (route.purpose === 'change' ? setRoute({ name: 'caregiver_settings' }) : closeCaregiverArea())}
            onLockout={onPinLockout}
          />
        );

      case 'caregiver_verify':
        return (
          <VerifyCodeScreen
            purpose={route.purpose}
            backend={backend}
            skipLabel={S.common.cancel}
            skipHint={S.pin.cancelHint}
            onVerified={() => {
              if (route.purpose === 'pin_reset') {
                // Identité confirmée par le cellulaire : nouveau code, sans l'ancien. L'ancien
                // reste en place tant que le nouveau n'est pas enregistré (abandon = rien ne change).
                setRoute({ name: 'caregiver_pin', purpose: 'reset' });
              } else {
                void refreshCaregiverStatus();
                setRoute({ name: 'caregiver_settings' });
              }
            }}
            onSkip={() => (route.purpose === 'pin_reset' ? closeCaregiverArea() : setRoute({ name: 'caregiver_settings' }))}
          />
        );

      case 'caregiver_settings':
        return (
          <CaregiverSettingsScreen
            mode="edit"
            initial={settings}
            defaultLanguage={locale}
            status={caregiverStatus}
            retailers={settings ? retailers : { kind: 'need_address' }}
            onSave={saveCaregiverSettings}
            onClose={closeCaregiverArea}
            onChangePin={() => setRoute({ name: 'caregiver_pin', purpose: 'change' })}
            onVerifyMobile={() => setRoute({ name: 'caregiver_verify', purpose: 'mobile' })}
            onOpenPrivacy={openPrivacy}
            onExport={exportAccount}
            onDelete={deleteAccount}
            onReloadRetailers={() => {
              setRetailers({ kind: 'loading' });
              void loadRetailers();
            }}
            cloudSpeech={setup?.consent.cloudSpeech ?? false}
            platform={platform}
            onCloudSpeechChange={changeCloudSpeech}
          />
        );

      case 'basket':
        return (
          <BasketScreen
            listId={list.listId}
            items={confirmedItems}
            caregiverFirstName={caregiverName}
            preferredStore={settings?.preferredRetailer?.name ?? null}
            locale={locale}
            speaker={speaker}
            speech={speech}
            backend={backend}
            onBackToList={backToList}
            onHandoffSent={onHandoffSent}
          />
        );

      case 'list':
        return (
          <HomeScreen
            list={list}
            micState={dictation.micState}
            partialText={dictation.partialText}
            isOnline={isOnline}
            justAdded={justAdded}
            lastRemoved={lastRemoved}
            seniorFirstName={settings?.seniorFirstName ?? null}
            caregiverFirstName={settings?.caregiverFirstName ?? null}
            onMicPress={dictation.onMicPress}
            onChangeQuantity={onChangeQuantity}
            onRemoveItem={onRemoveItem}
            onUndoRemove={onUndoRemove}
            onAnswerDisambiguation={answerDoubt}
            onValidateList={() => {
              speaker.stop();
              speech.stop();
              setRoute({ name: 'basket', sent: false });
            }}
            onRepeat={speaker.repeat}
            onCaregiverAccess={onCaregiverAccess}
          />
        );
    }
  })();

  return (
    <StringsContext.Provider value={S}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.root}>{screen}</View>
    </StringsContext.Provider>
  );
};

export const App: React.FC<AppProps> = (props) => (
  <SafeAreaProvider>
    <Root {...props} />
  </SafeAreaProvider>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
});

export default App;
