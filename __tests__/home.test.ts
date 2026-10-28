import { colors, palette } from '../src/theme/theme';
import { homeStatus, pictogramFor, type HomeStatusInput } from '../src/screens/home/homeModel';
import { listReducer } from '../src/state/listReducer';
import { stringsFor } from '../src/i18n';
import type { ConfirmedItem, ShoppingList } from '../src/types/vocourse';
import { listWith, now } from './fixtures';

/* ------------------------------ Contrastes ------------------------------ */

const luminance = (hex: string): number => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('Palette WCAG AAA', () => {
  it('donne au moins 7:1 à tout texte sur ses fonds', () => {
    const textPairs: ReadonlyArray<readonly [string, string]> = [
      [colors.text, colors.background],
      [colors.text, colors.surface],
      [colors.textSecondary, colors.background],
      [colors.textSecondary, colors.surface],
      [colors.actionText, colors.actionBackground],
      [colors.actionText, colors.actionBackgroundPressed],
      [colors.listeningText, colors.listening],
      [colors.actionOnBackground, colors.background],
      [colors.text, colors.listeningTint],
      [colors.text, colors.waitingTint],
      [colors.text, colors.successBackground],
      [colors.text, colors.offlineBackground],
      [colors.text, colors.infoBackground],
    ];
    for (const [fg, bg] of textPairs) {
      expect(`${fg} sur ${bg} : ${ratio(fg, bg) >= 7}`).toBe(`${fg} sur ${bg} : true`);
    }
  });

  it('donne au moins 3:1 aux bordures et aux ondes du micro', () => {
    for (const bg of [colors.background, colors.surface]) {
      expect(ratio(colors.border, bg) >= 3).toBe(true);
      expect(ratio(colors.listening, bg) >= 3).toBe(true);
    }
    expect(ratio(colors.actionBackground, colors.background) >= 3).toBe(true);
    expect(palette.butter).toBe('#FFF6DA');
  });
});

/* ------------------------------ Salutation ------------------------------ */

describe('Salutation', () => {
  it('bonjour / bonsoir, au prénom et au registre choisis ; matin, après-midi, soir en anglais', () => {
    expect(stringsFor('fr-CA', 'vous').home.greeting(9, 'Jeanne', false)).toEqual({
      title: 'Bonjour Jeanne !',
      subtitle: 'Que souhaitez-vous ajouter à votre épicerie aujourd’hui ?',
    });
    expect(stringsFor('fr-CA', 'tu').home.greeting(20, null, true)).toEqual({
      title: 'Bonsoir !',
      subtitle: 'Autre chose pour ton épicerie ?',
    });
    const en = stringsFor('en-CA');
    expect(en.home.greeting(9, 'Joan', false).title).toBe('Good morning, Joan!');
    expect(en.home.greeting(14, null, false).title).toBe('Good afternoon!');
    expect(en.home.greeting(19, null, true).subtitle).toBe('Anything else for your groceries?');
  });
});

/* -------------------------- État sous le micro --------------------------- */

const base: HomeStatusInput = {
  micState: 'idle',
  isOnline: true,
  hasDoubt: false,
  justAdded: null,
  partialText: '',
  itemCount: 0,
  queuedCount: 0,
};
const FR = stringsFor('fr-CA', 'vous');
const TU = stringsFor('fr-CA', 'tu');
const EN = stringsFor('en-CA');

describe('État affiché sous le micro', () => {
  it('passe par « En attente », « Écoute en cours… », « Je note… » et « Produit ajouté ! »', () => {
    expect(homeStatus(base, FR).title).toBe('En attente');
    expect(homeStatus({ ...base, micState: 'listening' }, FR).title).toBe('Écoute en cours…');
    expect(homeStatus({ ...base, micState: 'listening', partialText: 'deux cartons' }, FR).detail).toBe('« deux cartons »');
    expect(homeStatus({ ...base, micState: 'processing' }, FR).title).toBe('Je note…');
    const added = homeStatus({ ...base, justAdded: ['2 cartons de lait 2 %'] }, FR);
    expect([added.tone, added.symbol, added.title, added.detail]).toEqual(['added', '✓', 'Produit ajouté !', '2 cartons de lait 2 %']);
    expect(homeStatus({ ...base, justAdded: ['a', 'b'] }, FR).title).toBe('2 produits ajoutés !');
    expect(homeStatus({ ...base, justAdded: ['a', 'b'] }, EN).title).toBe('2 items added!');
  });

  it('donne la priorité à l’écoute, puis à l’ajout, puis à la question', () => {
    expect(homeStatus({ ...base, micState: 'listening', justAdded: ['x'], hasDoubt: true }, FR).tone).toBe('listening');
    expect(homeStatus({ ...base, justAdded: ['x'], hasDoubt: true }, FR).tone).toBe('added');
    expect(homeStatus({ ...base, hasDoubt: true, isOnline: false }, FR).tone).toBe('doubt');
  });

  it('rassure hors ligne et compte les messages gardés', () => {
    expect(homeStatus({ ...base, isOnline: false }, FR).detail).toBe('Vous pouvez parler quand même : je garde tout.');
    expect(homeStatus({ ...base, isOnline: false, queuedCount: 2 }, FR).detail).toBe('2 messages en attente. Rien n’est perdu.');
    expect(homeStatus({ ...base, micState: 'offline_recording' }, TU).detail).toBe('Hors ligne, mais je t’écoute. Je garde tout.');
    expect(homeStatus({ ...base, isOnline: false, queuedCount: 1 }, EN).detail).toBe('1 message waiting. Nothing is lost.');
  });

  it('porte toujours un symbole en plus de la couleur', () => {
    const states: HomeStatusInput[] = [
      base,
      { ...base, micState: 'listening' },
      { ...base, micState: 'processing' },
      { ...base, justAdded: ['x'] },
      { ...base, hasDoubt: true },
      { ...base, isOnline: false },
    ];
    for (const s of states) expect(homeStatus(s, FR).symbol.length > 0).toBe(true);
  });

  it('associe un pictogramme à chaque rayon', () => {
    expect(pictogramFor('dairy')).toBe('🥛');
    expect(pictogramFor('other')).toBe('🛒');
  });
});

/* ------------------------- Phrases de quantité --------------------------- */

const first = (l: ShoppingList): ConfirmedItem => {
  const i = l.items[0];
  if (!i || i.status !== 'confirmed') throw new Error('produit confirmé attendu');
  return i;
};

describe('Annonces de la liste', () => {
  it('annonce la quantité finale en une phrase, sans le format du paquet', () => {
    const l = listWith('deux cartons de lait 2 %');
    const item = { ...first(listReducer(l, { type: 'SET_QUANTITY', itemId: first(l).itemId, quantity: 3, now })) };
    expect(FR.format.itemSpoken(item)).toBe('3 cartons de lait 2 %');
    expect(FR.voice.quantityChanged(item)).toBe('C’est noté : 3 cartons de lait 2 %.');
    expect(FR.voice.restored('Lait 2 %, 2 L')).toBe('Lait 2 % est de retour dans la liste.');
  });

  it('élide « de » devant voyelle : « 1 sac d’oignons »', () => {
    const onions = first(listWith('un sac d’oignons'));
    expect(FR.format.itemSpoken(onions)).toBe('1 sac d’oignons jaunes');
  });
});
