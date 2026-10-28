/**
 * Textes des textos envoyés à l'aidant, en français et en anglais.
 * Règles : aucun nom de produit (avenant CA-3.3), pas de montant (aucun prix n'est
 * estimé), mention STOP dans le message de bienvenue (Loi canadienne anti-pourriel).
 */

import type { Locale, Tier } from './instacart.ts';

const TIER: Readonly<Record<Locale, Readonly<Record<Tier, string>>>> = {
  'fr-CA': { economy: 'Économique', balanced: 'Équilibré', premium_organic: 'Bio' },
  'en-CA': { economy: 'Economy', balanced: 'Balanced', premium_organic: 'Organic' },
};

const who = (locale: Locale, senior: string | null): string =>
  senior ?? (locale === 'fr-CA' ? 'Votre proche' : 'Your loved one');

export const sms = {
  verification: (locale: Locale, code: string): string =>
    locale === 'fr-CA'
      ? `Vocourse : votre code de vérification est ${code}. Il expire dans 10 minutes. Ne le communiquez à personne.`
      : `Vocourse: your verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`,

  pinReset: (locale: Locale, code: string): string =>
    locale === 'fr-CA'
      ? `Vocourse : code pour choisir un nouveau code d’aidant : ${code} (valide 10 minutes). Si vous n’avez rien demandé, ignorez ce message.`
      : `Vocourse: code to set a new caregiver PIN: ${code} (valid 10 minutes). If you didn’t ask for this, ignore this message.`,

  welcome: (locale: Locale, senior: string | null): string =>
    locale === 'fr-CA'
      ? `Vocourse : numéro confirmé. Vous recevrez ici les listes d’épicerie de ${senior ?? 'votre proche'}. Répondez STOP pour ne plus recevoir de textos.`
      : `Vocourse: number confirmed. You will receive ${senior ? `${senior}’s` : 'your loved one’s'} grocery lists here. Reply STOP to opt out.`,

  handoff: (
    locale: Locale,
    p: { readonly senior: string | null; readonly count: number; readonly tier: Tier; readonly store: string | null; readonly url: string; readonly days: number },
  ): string =>
    locale === 'fr-CA'
      ? `Vocourse : ${who(locale, p.senior)} vous envoie sa liste d’épicerie (${p.count} produit${p.count > 1 ? 's' : ''}, panier ${TIER[locale][p.tier]}). ` +
        `Choisissez le magasin${p.store ? ` (de préférence ${p.store})` : ''} et payez sur Instacart : ${p.url} — lien valide ${p.days} jours.`
      : `Vocourse: ${who(locale, p.senior)} sent you a grocery list (${p.count} item${p.count > 1 ? 's' : ''}, ${TIER[locale][p.tier]} basket). ` +
        `Pick the store${p.store ? ` (preferably ${p.store})` : ''} and pay on Instacart: ${p.url} — link valid ${p.days} days.`,

  pinLockout: (locale: Locale, senior: string | null): string =>
    locale === 'fr-CA'
      ? `Vocourse : 3 codes erronés ont été saisis dans l’espace aidant du téléphone de ${senior ?? 'votre proche'}. L’accès est bloqué 15 minutes.`
      : `Vocourse: 3 wrong codes were entered in the caregiver area on ${senior ? `${senior}’s` : 'your loved one’s'} phone. Access is locked for 15 minutes.`,

  settingsChanged: (locale: Locale, senior: string | null): string =>
    locale === 'fr-CA'
      ? `Vocourse : les réglages de l’espace aidant ont été modifiés sur le téléphone de ${senior ?? 'votre proche'}. Si ce n’était pas vous, vérifiez-les.`
      : `Vocourse: caregiver settings were changed on ${senior ? `${senior}’s` : 'your loved one’s'} phone. If this wasn’t you, please check them.`,
};
