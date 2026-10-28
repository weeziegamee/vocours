/**
 * Une prise de dictée, indépendante de la bibliothèque native (logique pure, testable).
 *
 * - Reconnaissance sur l'appareil quand le téléphone sait le faire : l'audio ne quitte
 *   jamais le téléphone et la dictée fonctionne hors ligne.
 * - Sinon, reconnaissance en ligne d'Apple ou de Google, seulement si l'aidant l'a
 *   autorisée (consentement à la configuration) et si Internet est disponible.
 * - Fin de prise : 4 s de silence après la dernière parole, ou second appui sur le micro.
 * - Toujours un seul rappel final (`onFinal` ou `onError`), même si la bibliothèque envoie
 *   plusieurs évènements de fin.
 */

import type { AppLocale, SpeechCallbacks, SpeechErrorReason, SpeechPort } from '../../types/vocourse';

/** Ce dont la session a besoin de la bibliothèque native (expo-speech-recognition). */
export interface RecognizerModule {
  requestPermissions(): Promise<boolean>;
  /** Reconnaissance possible sans réseau pour cette langue (moteur et langue installés). */
  supportsOnDevice(locale: AppLocale): Promise<boolean>;
  start(options: { readonly locale: AppLocale; readonly onDevice: boolean; readonly contextualStrings: readonly string[] }): void;
  stop(): void;
  abort(): void;
  /** Abonnements ; chaque fonction renvoie de quoi se désabonner. */
  onResult(cb: (e: { readonly transcript: string; readonly confidence: number | null; readonly isFinal: boolean }) => void): () => void;
  onError(cb: (code: string) => void): () => void;
  onEnd(cb: () => void): () => void;
}

export interface SpeechSessionDeps {
  readonly module: RecognizerModule;
  readonly isOnline: () => boolean;
  readonly silenceMs?: number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (t: unknown) => void;
  readonly contextualStrings?: Readonly<Record<AppLocale, readonly string[]>>;
}

export const mapErrorCode = (code: string): SpeechErrorReason => {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission_denied';
    case 'no-speech':
    case 'speech-timeout':
    case 'nomatch':
      return 'no_speech';
    case 'network':
      return 'needs_network';
    default:
      return 'unavailable';
  }
};

/** Mots fréquents qui aident la reconnaissance (iOS « contextualStrings »). */
export const GROCERY_HINTS: Readonly<Record<AppLocale, readonly string[]>> = {
  'fr-CA': ['lait 2 %', 'douzaine d’œufs', 'fèves au lard', 'cretons', 'fromage en grains', 'croustilles', 'yogourt', 'pinte de lait', 'poche de patates'],
  'en-CA': ['2% milk', 'dozen eggs', 'bag of milk', 'homo milk', 'cheese curds', 'baked beans', 'two-four'],
};

export const createSpeechSession = (deps: SpeechSessionDeps): SpeechPort => {
  const silenceMs = deps.silenceMs ?? 4000;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const hints = deps.contextualStrings ?? GROCERY_HINTS;
  let locale: AppLocale = 'fr-CA';
  let cloudAllowed = false;
  let permission: boolean | null = null;

  let active: {
    callbacks: SpeechCallbacks;
    finalText: string;
    partial: string;
    confidence: number | null;
    timer: unknown;
    done: boolean;
    unsubscribe: () => void;
  } | null = null;
  /**
   * Démarrage en cours (permission, détection du moteur) : posé AVANT toute attente, pour
   * qu'un second appui ne lance pas deux prises, et qu'un arrêt pendant le démarrage annule.
   */
  let starting: { cancelled: boolean } | null = null;

  const finish = (outcome: { kind: 'final' } | { kind: 'error'; reason: SpeechErrorReason }): void => {
    const s = active;
    if (!s || s.done) return;
    s.done = true;
    if (s.timer !== null) clearTimer(s.timer);
    s.unsubscribe();
    active = null;
    const text = `${s.finalText} ${s.partial}`.replace(/\s+/g, ' ').trim();
    if (outcome.kind === 'error' && !(outcome.reason === 'no_speech' && text !== '')) {
      s.callbacks.onError(outcome.reason);
      return;
    }
    if (text === '') s.callbacks.onError('no_speech');
    else s.callbacks.onFinal(text, s.confidence);
  };

  const armSilence = (): void => {
    const s = active;
    if (!s) return;
    if (s.timer !== null) clearTimer(s.timer);
    s.timer = setTimer(() => deps.module.stop(), silenceMs);
  };

  return {
    setLocale(l) {
      locale = l;
    },
    setCloudAllowed(allowed) {
      cloudAllowed = allowed;
    },
    worksOffline: () => deps.module.supportsOnDevice(locale),

    start(callbacks) {
      if (active || starting) return;
      const ticket = { cancelled: false };
      starting = ticket;
      void (async () => {
        const fail = (reason: SpeechErrorReason): void => {
          starting = null;
          callbacks.onError(ticket.cancelled ? 'cancelled' : reason);
        };
        try {
          if (permission !== true) permission = await deps.module.requestPermissions();
        } catch {
          permission = null;
          fail('unavailable');
          return;
        }
        if (!permission) {
          fail('permission_denied');
          return;
        }
        let onDevice = false;
        try {
          onDevice = await deps.module.supportsOnDevice(locale);
        } catch {
          onDevice = false;
        }
        if (ticket.cancelled) {
          fail('cancelled');
          return;
        }
        if (!onDevice) {
          if (!cloudAllowed) {
            fail('cloud_not_allowed');
            return;
          }
          if (!deps.isOnline()) {
            fail('needs_network');
            return;
          }
        }
        starting = null;
        const subs = [
          deps.module.onResult((e) => {
            const s = active;
            if (!s || s.done) return;
            if (e.isFinal) {
              s.finalText = `${s.finalText} ${e.transcript}`.trim();
              s.partial = '';
              if (e.confidence !== null) s.confidence = e.confidence;
            } else {
              s.partial = e.transcript;
            }
            s.callbacks.onPartial(`${s.finalText} ${s.partial}`.trim());
            armSilence();
          }),
          deps.module.onError((code) => finish({ kind: 'error', reason: mapErrorCode(code) })),
          deps.module.onEnd(() => finish({ kind: 'final' })),
        ];
        active = {
          callbacks,
          finalText: '',
          partial: '',
          confidence: null,
          timer: null,
          done: false,
          unsubscribe: () => subs.forEach((u) => u()),
        };
        // Sans parole du tout pendant 8 s, la prise s'arrête aussi.
        active.timer = setTimer(() => deps.module.stop(), silenceMs * 2);
        try {
          deps.module.start({ locale, onDevice, contextualStrings: hints[locale] });
        } catch {
          finish({ kind: 'error', reason: 'unavailable' });
        }
      })();
    },

    stop() {
      if (starting) starting.cancelled = true;
      else if (active && !active.done) deps.module.stop();
    },
  };
};
