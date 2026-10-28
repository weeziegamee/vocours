/**
 * Réponses vocales courtes, reconnues sur le téléphone (aucun appel au serveur) :
 * « oui », « non », « répète », « oui, je commande », « le deuxième », « équilibré »…
 * La seconde confirmation vocale exige la phrase complète « je commande » / « place the order ».
 */

import type { AppLocale, BasketTier, VoiceIntent } from '../../types/vocourse';

type Kindless = VoiceIntent extends infer U ? (U extends { readonly intentId: string } ? Omit<U, 'intentId'> : never) : never;

const norm = (s: string): string =>
  ` ${s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

const has = (text: string, phrases: readonly string[]): boolean => phrases.some((p) => text.includes(` ${p} `));

const FR = {
  order: ['je commande', 'oui je commande', 'commande le', 'passe la commande', 'envoie le', 'envoyez le'],
  repeat: ['repete', 'repetez', 'repeter', 'quoi', 'pardon', 'comment', 'redis', 'redites'],
  cancel: ['annule', 'annuler', 'annulez', 'arrete', 'arretez', 'laisse faire', 'laissez faire'],
  none: ['aucun', 'aucune', 'aucun des trois', 'rien de ca', 'ni l un ni l autre'],
  yes: ['oui', 'ouais', 'ouin', 'correct', 'd accord', 'parfait', 'exact', 'c est ca', 'c est bon', 'oui c est ca', 'en plein ca'],
  no: ['non', 'pas ca', 'pas vraiment', 'change', 'changer'],
  first: ['premier', 'premiere', 'le 1', 'numero 1', 'un'],
  second: ['deuxieme', 'second', 'seconde', 'le 2', 'numero 2', 'deux'],
  third: ['troisieme', 'le 3', 'numero 3', 'trois'],
  tiers: { economy: ['economique', 'eco', 'le moins cher', 'pas cher'], balanced: ['equilibre', 'le milieu', 'normal'], premium_organic: ['bio', 'biologique'] },
} as const;

const EN = {
  order: ['place the order', 'place order', 'yes place the order', 'order it', 'send it', 'go ahead and order'],
  repeat: ['repeat', 'again', 'what', 'pardon', 'sorry', 'say that again'],
  cancel: ['cancel', 'stop', 'never mind', 'nevermind'],
  none: ['none', 'none of them', 'none of those', 'neither'],
  yes: ['yes', 'yeah', 'yep', 'yup', 'correct', 'right', 'that s right', 'okay', 'ok', 'sure', 'exactly'],
  no: ['no', 'nope', 'not that', 'change it'],
  first: ['first', 'the first one', 'number one', 'one'],
  second: ['second', 'the second one', 'number two', 'two'],
  third: ['third', 'the third one', 'number three', 'three'],
  tiers: { economy: ['economy', 'cheapest', 'cheap'], balanced: ['balanced', 'middle', 'regular'], premium_organic: ['organic'] },
} as const;

let seq = 0;

/** `null` : rien de reconnu (l'appli dit « Je n'ai pas compris »). L'ordre des tests compte. */
export const parseVoiceIntent = (said: string, locale: AppLocale): VoiceIntent | null => {
  const t = norm(said);
  const L = locale === 'en-CA' ? EN : FR;
  const found = ((): Kindless | null => {
    // « Je commande pas », « don't order » : jamais une confirmation.
    const negated = locale === 'en-CA' ? has(t, ['not', 'don t', 'do not', 'no']) : has(t, ['pas', 'non', 'jamais']);
    if (has(t, L.order) && !negated) return { kind: 'confirm_order' };
    if (has(t, L.cancel)) return { kind: 'cancel' };
    if (has(t, L.repeat)) return { kind: 'repeat' };
    if (has(t, L.none)) return { kind: 'none_matched' };
    for (const tier of ['economy', 'balanced', 'premium_organic'] as const satisfies readonly BasketTier[]) {
      if (has(t, L.tiers[tier])) return { kind: 'choose_tier', tier };
    }
    if (has(t, L.third)) return { kind: 'choose_candidate', rank: 3 };
    if (has(t, L.second)) return { kind: 'choose_candidate', rank: 2 };
    if (has(t, L.first)) return { kind: 'choose_candidate', rank: 1 };
    if (has(t, L.no)) return { kind: 'no' };
    if (has(t, L.yes)) return { kind: 'yes' };
    return null;
  })();
  return found ? ({ ...found, intentId: `vi_${(seq += 1)}` } as VoiceIntent) : null;
};
