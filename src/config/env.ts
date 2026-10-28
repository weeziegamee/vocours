/**
 * Configuration d'exécution, lue dans `extra` de app.config.js (variables d'environnement
 * au moment de la compilation, voir eas.json) :
 * - `live` : serveur Vocourse réel (versions publiées) ;
 * - `demo` : tout le parcours sur le téléphone, sans serveur (démonstrations, développement).
 */

import type { MockScenario } from '../services/api/mockVocourseBackend';

export interface AppEnv {
  readonly mode: 'live' | 'demo';
  readonly apiUrl: string;
  readonly privacyPolicyUrl: { readonly 'fr-CA': string; readonly 'en-CA': string };
  /** Version de la politique de confidentialité présentée au consentement. */
  readonly privacyPolicyVersion: string;
  /** Développement seulement : serveur local en http://. */
  readonly allowLocalHttp: boolean;
  readonly demo: {
    readonly scenario: Partial<MockScenario>;
    /** Simulateur sans micro : phrases préenregistrées au lieu de la vraie dictée. */
    readonly simulatedSpeech: boolean;
    /** Démarre hors ligne pour montrer la file d'attente, puis revient après ce délai. */
    readonly startOffline: boolean;
    readonly goOnlineAfterMs: number | null;
  };
}

export const DEFAULT_ENV: AppEnv = {
  mode: 'demo',
  apiUrl: 'https://api.vocourse.ca',
  privacyPolicyUrl: {
    'fr-CA': 'https://vocourse.ca/confidentialite',
    'en-CA': 'https://vocourse.ca/en/privacy',
  },
  privacyPolicyVersion: '2026-10',
  allowLocalHttp: false,
  demo: {
    scenario: { latencyMs: 600, failFirstHandoff: null, caregiverUnreachable: false },
    simulatedSpeech: false,
    startOffline: false,
    goOnlineAfterMs: null,
  },
};

const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback);

/** Construit l'environnement à partir de `Constants.expoConfig.extra` (valeurs inconnues ignorées). */
export const envFromExtra = (extra: Record<string, unknown> | undefined): AppEnv => {
  const e = extra ?? {};
  const mode = e['mode'] === 'live' ? 'live' : 'demo';
  return {
    ...DEFAULT_ENV,
    mode,
    apiUrl: str(e['apiUrl'], DEFAULT_ENV.apiUrl),
    privacyPolicyUrl: {
      'fr-CA': str(e['privacyPolicyUrlFr'], DEFAULT_ENV.privacyPolicyUrl['fr-CA']),
      'en-CA': str(e['privacyPolicyUrlEn'], DEFAULT_ENV.privacyPolicyUrl['en-CA']),
    },
    privacyPolicyVersion: str(e['privacyPolicyVersion'], DEFAULT_ENV.privacyPolicyVersion),
    allowLocalHttp: e['allowLocalHttp'] === true,
    demo: { ...DEFAULT_ENV.demo, simulatedSpeech: e['simulatedSpeech'] === true },
  };
};
