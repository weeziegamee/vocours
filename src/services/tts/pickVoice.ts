/** Choix de la voix de synthèse (logique pure, testable sans téléphone). */

import type { AppLocale } from '../../types/vocourse';

export interface VoiceInfo {
  readonly identifier: string;
  readonly language: string;
  readonly quality?: string;
}

/**
 * Meilleure voix pour la langue : variante canadienne exacte d'abord, voix « améliorée »
 * ensuite, puis toute voix de la même langue. `null` : voix par défaut du téléphone.
 */
export const pickVoice = (voices: readonly VoiceInfo[], locale: AppLocale): string | null => {
  const norm = (l: string): string => l.replace('_', '-').toLowerCase();
  const exact = voices.filter((v) => norm(v.language) === locale.toLowerCase());
  const sameLang = voices.filter((v) => norm(v.language).startsWith(locale.slice(0, 2)));
  const enhanced = (list: readonly VoiceInfo[]): VoiceInfo | undefined => list.find((v) => v.quality === 'Enhanced');
  return (enhanced(exact) ?? exact[0] ?? enhanced(sameLang) ?? sameLang[0])?.identifier ?? null;
};
