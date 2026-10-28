/**
 * Vocourse — système de design accessible (WCAG 2.2 AAA, senior-friendly)
 *
 * Unités : en React Native, `fontSize` et les dimensions sont en unités
 * indépendantes de la densité (points iOS / dp Android). « 20 pt » du cahier
 * des charges = `fontSize: 20`.
 *
 * Ambiance : un fond « beurre » ensoleillé, des cartes blanches à bordure taupe chaude,
 * le vert pour agir, le bleu « bleuet » réservé à l'écoute du micro.
 *
 * Contrastes mesurés (formule WCAG de luminance relative ; vérifiés par
 * __tests__/theme.test.ts) — texte AAA ≥ 7:1, éléments graphiques ≥ 3:1 :
 *   #111111 sur #FFF6DA (fond) ......... 17,49:1  texte
 *   #4A4237 sur #FFF6DA (fond) .........  9,15:1  texte secondaire
 *   #FFFFFF sur #0A5E34 (action) .......  7,88:1  texte normal sur bouton vert
 *   #FFFFFF sur #1D3E8A (écoute) .......  9,96:1  icône du micro en écoute
 *   #0A5E34 sur #FFF6DA ................  7,30:1  texte vert sur le fond
 *   #7A6A4F (bordure) sur #FFFFFF ......  5,25:1  contour des cartes et champs
 *   #7A6A4F (bordure) sur #FFF6DA ......  4,86:1
 *   #111111 sur les teintes d'état ..... ≥ 15:1
 */

import type { TextStyle, ViewStyle } from 'react-native';

import { FONTS_EMBEDDED } from './fonts';

/* -------------------------------------------------------------------------- */
/* Couleurs                                                                   */
/* -------------------------------------------------------------------------- */

export const palette = {
  ink: '#111111',
  paper: '#FFFFFF',
  butter: '#FFF6DA', // fond de l'appli
  sun: '#FFE7A3', // halo décoratif du micro (sans texte dessus)
  taupe: '#7A6A4F', // bordures
  action: '#0A5E34',
  actionPressed: '#084D2A',
  bleuet: '#1D3E8A', // micro à l'écoute
  bleuetTint: '#E4ECFA',
  alert: '#FFD400',
  inkSecondary: '#4A4237',
  surfaceMuted: '#ECE7DC', // #111111 dessus : 15,31:1
  surfaceSuccess: '#DDF0E3', // #111111 dessus : 15,87:1
  surfaceWaiting: '#FFE9A8', // #111111 dessus : 15,71:1
} as const;

export type PaletteColor = (typeof palette)[keyof typeof palette];

/** Rôles sémantiques : les composants n'utilisent que ces clés. */
export const colors = {
  background: palette.butter,
  /** Cartes, champs, touches : blanc sur le fond beurre. */
  surface: palette.paper,
  text: palette.ink,
  textSecondary: palette.inkSecondary,
  /** Action principale (micro, « C'est bon », « Je commande »). */
  actionBackground: palette.action,
  actionBackgroundPressed: palette.actionPressed,
  actionText: palette.paper,
  /** Information non bloquante (hors ligne, prix estimé, attente). Jamais de rouge. */
  infoBackground: palette.alert,
  infoText: palette.ink,
  /** Mode hors ligne : gris, pas d'alarme. */
  offlineBackground: palette.surfaceMuted,
  offlineText: palette.ink,
  successBackground: palette.surfaceSuccess,
  successText: palette.ink,
  /** Bordure des cartes et des champs : taupe chaud, ≥ 4,8:1 (élément graphique ≥ 3:1). */
  border: palette.taupe,
  /** Contour fort : focus, carte choisie. */
  borderStrong: palette.ink,
  focusRing: palette.ink,
  /** Micro à l'écoute et ses ondes. */
  listening: palette.bleuet,
  listeningText: palette.paper,
  /** Teintes des bandeaux d'état (texte encre dessus, ≥ 15:1). */
  listeningTint: palette.bleuetTint,
  waitingTint: palette.surfaceWaiting,
  /** Halo décoratif autour du micro au repos. */
  halo: palette.sun,
  /** Texte vert sur le fond (marque, liens d'action) : 7,30:1. */
  actionOnBackground: palette.action,
  disabledBackground: palette.surfaceMuted,
  /** Désactivé : texte inchangé (pas de gris pâle) ; l'état passe par le libellé et l'accessibilité. */
  disabledText: palette.ink,
  /** Jauge d'appui long : remplissage vert foncé sur piste gris clair (9,97:1 avec le blanc). */
  gaugeTrack: palette.surfaceMuted,
  gaugeFill: palette.actionPressed,
} as const;

export type ColorRole = keyof typeof colors;

/* -------------------------------------------------------------------------- */
/* Typographie                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Atkinson Hyperlegible (licence SIL OFL), embarquée si les fichiers sont présents dans
 * assets/fonts au moment de la compilation (scripts/fetch-fonts.sh) ; sinon police système.
 */
export const fontFamily: { readonly regular: string | undefined; readonly bold: string | undefined } = FONTS_EMBEDDED
  ? { regular: 'AtkinsonHyperlegible-Regular', bold: 'AtkinsonHyperlegible-Bold' }
  : { regular: undefined, bold: undefined };

export const fontSize = {
  /** Minimum absolu de l'application (mentions, dates). */
  min: 20,
  /** Libellés de section. */
  label: 22,
  /** Corps de texte, lignes de liste, libellés. */
  body: 24,
  /** Cartes de levée de doute. */
  choice: 26,
  /** Titre d'écran. */
  title: 28,
  /** Montants et quantités. */
  display: 32,
} as const;

export type FontSizeToken = keyof typeof fontSize;

export const LINE_HEIGHT_RATIO = 1.5;

/** Hauteur de ligne à 1,5 × la taille, arrondie au pixel entier. */
export const lineHeightFor = (size: number): number => Math.round(size * LINE_HEIGHT_RATIO);

/**
 * L'utilisateur peut agrandir le texte du système jusqu'à 200 % (V3.0 §3.1).
 * À passer en `maxFontSizeMultiplier` sur chaque <Text>.
 */
export const MAX_FONT_SCALE = 2;

const textStyle = (size: number, weight: 'regular' | 'bold'): TextStyle => ({
  ...((weight === 'bold' ? fontFamily.bold : fontFamily.regular) ? { fontFamily: weight === 'bold' ? fontFamily.bold : fontFamily.regular } : {}),
  fontWeight: weight === 'bold' ? '700' : '400',
  fontSize: size,
  lineHeight: lineHeightFor(size),
  color: colors.text,
});

export const typography = {
  caption: textStyle(fontSize.min, 'regular'),
  label: textStyle(fontSize.label, 'bold'),
  body: textStyle(fontSize.body, 'regular'),
  bodyBold: textStyle(fontSize.body, 'bold'),
  choice: textStyle(fontSize.choice, 'bold'),
  title: textStyle(fontSize.title, 'bold'),
  display: textStyle(fontSize.display, 'bold'),
  /** Texte sur fond `action` ou `listening` (blanc, ≥ 7,8:1). */
  action: { ...textStyle(fontSize.body, 'bold'), color: colors.actionText },
  /** Salutation de l'écran d'accueil. */
  greeting: textStyle(fontSize.display, 'bold'),
} as const satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof typography;

/* -------------------------------------------------------------------------- */
/* Cibles tactiles et espacements                                             */
/* -------------------------------------------------------------------------- */

export const touchTarget = {
  /** Minimum de toute cible (au-delà des 44 px du critère AAA 2.5.5). */
  min: 64,
  /** Ligne de liste. */
  listRow: 72,
  /** Bouton de pied de page « C'est bon ». */
  footerButton: 80,
  /** Bouton « Je commande » (écran B). */
  primaryCommit: 96,
  /** Carte de levée de doute. */
  choiceCard: 120,
  /** Bouton micro de l'écran d'accueil (diamètre). */
  mic: 168,
  /** Micro réduit du pied d'écran (diamètre). */
  micCompact: 72,
} as const;

export const spacing = {
  xs: 8,
  /** Espace minimal entre deux cibles tactiles. */
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  /** Cartes de produit, encadrés : coins doux, nettement arrondis. */
  card: 20,
  /** Boutons et touches : un peu moins arrondis que les cartes qui les portent. */
  button: 16,
  round: 9999,
} as const;

export const borderWidth = {
  card: 2,
  /** Carte conseillée, focus clavier ou lecteur d'écran. */
  emphasis: 4,
} as const;

/* -------------------------------------------------------------------------- */
/* Mouvement, voix, délais                                                    */
/* -------------------------------------------------------------------------- */

export const motion = {
  /** Toute animation dure moins de 300 ms et est coupée si « Réduire les animations ». */
  maxDurationMs: 280,
  highlightMs: 1000,
} as const;

export const voice = {
  defaultRate: 0.85,
  minRate: 0.7,
  maxRate: 1.1,
  pauseBetweenItemsMs: 400,
} as const;

export const timing = {
  /** Fin d'écoute après 4 s de silence (V3.0 §4.6). */
  endOfSpeechSilenceMs: 4000,
  /** Bandeau « Produit ajouté ! » (avant retour à « En attente »). */
  addedFeedbackMs: 4000,
  /** Délai pour annuler le retrait d'un produit. */
  undoRemoveMs: 10000,
  /** Attente après le dernier appui sur + ou − avant d'annoncer la quantité. */
  quantitySpeakDelayMs: 900,
  /** Cycle d'une onde du micro à l'écoute (lent, rassurant). */
  listeningWaveMs: 2200,
  /** Appui long de confirmation « Je commande ». */
  commitLongPressMs: 2000,
} as const;

/* -------------------------------------------------------------------------- */
/* Styles de base réutilisables                                               */
/* -------------------------------------------------------------------------- */

export const baseStyles = {
  screen: { flex: 1, backgroundColor: colors.background } satisfies ViewStyle,
  touchable: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    justifyContent: 'center',
    alignItems: 'center',
  } satisfies ViewStyle,
  card: {
    borderWidth: borderWidth.card,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    backgroundColor: colors.surface,
  } satisfies ViewStyle,
} as const;

export const theme = {
  palette,
  colors,
  fontFamily,
  fontSize,
  typography,
  touchTarget,
  spacing,
  radius,
  borderWidth,
  motion,
  voice,
  timing,
  baseStyles,
  lineHeightFor,
  MAX_FONT_SCALE,
} as const;

export type Theme = typeof theme;
export default theme;
