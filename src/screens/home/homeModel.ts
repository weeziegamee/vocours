/**
 * Écran d'accueil — logique pure (sans React Native) : état affiché sous le micro et
 * pictogrammes de rayon. Les textes viennent de src/i18n.
 */

import type { Category, MicState } from '../../types/vocourse';
import type { Strings } from '../../i18n';

export type HomeTone = 'idle' | 'listening' | 'processing' | 'added' | 'doubt' | 'offline';

export interface HomeStatus {
  readonly tone: HomeTone;
  /** Symbole qui double la couleur (jamais la couleur seule). */
  readonly symbol: string;
  readonly title: string;
  readonly detail: string;
}

export interface HomeStatusInput {
  readonly micState: MicState;
  readonly isOnline: boolean;
  readonly hasDoubt: boolean;
  /** Libellés des produits tout juste ajoutés, ou `null`. */
  readonly justAdded: readonly string[] | null;
  readonly partialText: string;
  readonly itemCount: number;
  /** Dictées gardées hors ligne, pas encore écrites. */
  readonly queuedCount: number;
}

/** Priorité : écoute > analyse > « ajouté » > question > hors ligne > en attente. */
export const homeStatus = (s: HomeStatusInput, S: Strings): HomeStatus => {
  const T = S.home.status;
  if (s.micState === 'listening' || s.micState === 'offline_recording') {
    const heard = s.partialText.trim();
    return {
      tone: 'listening',
      symbol: '◉',
      title: T.listening,
      detail: heard ? `« ${heard} »` : T.listeningDetail(s.micState === 'offline_recording'),
    };
  }
  if (s.micState === 'processing') return { tone: 'processing', symbol: '…', title: T.processing, detail: T.processingDetail };
  if (s.justAdded && s.justAdded.length > 0) {
    return { tone: 'added', symbol: '✓', title: T.added(s.justAdded.length), detail: s.justAdded.join(', ') };
  }
  if (s.hasDoubt) return { tone: 'doubt', symbol: '?', title: T.doubt, detail: T.doubtDetail };
  const queued = s.queuedCount > 0 ? T.queued(s.queuedCount) : null;
  if (!s.isOnline) return { tone: 'offline', symbol: '○', title: T.offline, detail: queued ?? T.offlineDetail };
  if (queued) return { tone: 'processing', symbol: '…', title: T.writing, detail: queued };
  return { tone: 'idle', symbol: '○', title: T.idle, detail: s.itemCount === 0 ? T.idleEmpty : T.idleMore };
};

const CATEGORY_PICTOGRAMS: Readonly<Record<Category, string>> = {
  dairy: '🥛',
  bakery: '🍞',
  pantry: '🥫',
  deli: '🥓',
  meat: '🍗',
  beverages: '🧃',
  produce: '🥕',
  frozen: '🧊',
  snacks: '🍿',
  household: '🧻',
  personal_care: '🧴',
  other: '🛒',
};

/** Pictogramme d'aide à la reconnaissance (toujours accompagné du nom du produit). */
export const pictogramFor = (category: Category): string => CATEGORY_PICTOGRAMS[category] ?? '🛒';
