import { stringsFor } from '../src/i18n';
import type { Strings } from '../src/i18n';
import type { ConfirmedItem } from '../src/types/vocourse';
import { confirmedItems } from './fixtures';

/** Toutes les valeurs (textes et fonctions appelées avec des arguments d'exemple) sont non vides. */
const walk = (v: unknown, path: string, out: string[]): void => {
  if (typeof v === 'string') {
    if (v.trim() === '' && !path.endsWith('.unit')) out.push(path);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
    return;
  }
  if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out);
};

const keysOf = (v: unknown, prefix = ''): string[] =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? Object.entries(v).flatMap(([k, x]) => [`${prefix}${k}`, ...keysOf(x, `${prefix}${k}.`)])
    : [];

describe('Textes bilingues', () => {
  const FR = stringsFor('fr-CA', 'vous');
  const TU = stringsFor('fr-CA', 'tu');
  const EN = stringsFor('en-CA');

  it('les deux langues ont exactement les mêmes clés', () => {
    expect(keysOf(EN).sort()).toEqual(keysOf(FR).sort());
  });

  it('aucun texte vide', () => {
    for (const s of [FR, TU, EN] as Strings[]) {
      const empty: string[] = [];
      walk(s, s.locale, empty);
      expect(empty).toEqual([]);
    }
  });

  it('aucun texte anglais ne reste en français (et inversement)', () => {
    // Les exemples de vouvoiement / tutoiement restent en français dans les réglages anglais.
    const { registerVousHint: _v, registerTuHint: _t, ...enSettings } = EN.settings;
    const enText = JSON.stringify({ ...EN, settings: enSettings });
    expect(enText).not.toMatch(/ vous | votre |Réessayez|Choisissez/);
    const frText = JSON.stringify(FR);
    expect(frText).not.toMatch(/ your | please |Try again/i);
  });

  it('accorde quantités et unités', () => {
    expect(FR.format.quantityWithUnit(2, 'carton')).toBe('2 cartons');
    expect(FR.format.quantityWithUnit(1.5, 'lb')).toBe('1,5 livres');
    expect(FR.format.quantityWithUnit(3, 'unit')).toBe('3');
    expect(EN.format.quantityWithUnit(2, 'box')).toBe('2 boxes');
    expect(EN.format.quantityWithUnit(1, 'dozen')).toBe('1 dozen');
  });

  it('lit les produits naturellement dans chaque langue', () => {
    const [milk, eggs] = confirmedItems('deux cartons de lait 2 % pis une douzaine d’œufs') as [ConfirmedItem, ConfirmedItem];
    expect(FR.format.itemSpoken(milk)).toBe('2 cartons de lait 2 %');
    expect(FR.format.itemSpoken(eggs)).toBe('1 douzaine d’œufs gros');
    expect(FR.voice.noted([milk, eggs])).toBe('J’ai noté : 2 cartons de lait 2 % et 1 douzaine d’œufs gros.');
    expect(EN.format.itemSpoken({ ...milk, productLabel: '2% milk, 2 L' })).toBe('2 cartons of 2% milk');
  });

  it('relit le panier sans prix, avec l’épicerie préférée', () => {
    const items = confirmedItems('du café et du pain');
    expect(FR.basket.v.readback('economy', items, 'Paul', 'Maxi')).toBe(
      'Vous choisissez le panier Économique, 2 produits : 1 paquet de café moulu et 1 paquet de pain tranché blanc. ' +
        'Paul choisira le magasin, de préférence Maxi, et verra le prix exact avant de payer sur Instacart. C’est bien ça ?',
    );
    expect(TU.basket.v.readback('balanced', items, 'Paul', null)).toMatch(/^Tu choisis le panier Équilibré/);
    expect(EN.basket.v.readback('premium_organic', items, 'Paul', null)).toMatch(/^You chose the Organic basket, 2 items:/);
    expect(JSON.stringify(FR.basket.v.readback('economy', items, 'Paul', 'Maxi'))).not.toMatch(/\$|dollar/);
  });

  it('décrit les gammes selon l’enseigne', () => {
    expect(FR.format.tierDescription('economy', 'Maxi')).toBe('Marque maison de Maxi, quand elle existe.');
    expect(EN.format.tierDescription('economy', null)).toBe('Store brands, when available.');
  });

  it('nomme les provinces et territoires', () => {
    expect(FR.format.province('NL')).toBe('Terre-Neuve-et-Labrador');
    expect(EN.format.province('QC')).toBe('Quebec');
  });

  it('formate le compte à rebours du blocage', () => {
    expect(FR.format.countdown(14 * 60_000 + 5_000)).toEqual({ visual: '14 min 05 s', spoken: 'environ 15 minutes' });
    expect(EN.format.countdown(30_000).spoken).toBe('about 1 minute');
  });

  it('explique les refus du serveur sans jargon', () => {
    expect(FR.basket.v.failure('conflict', 'caregiver_unverified', 'Paul')).toMatch(/numéro de Paul doit d’abord être confirmé/);
    expect(EN.basket.v.failure('offline', undefined, 'Paul')).toMatch(/Internet is down/);
    expect(FR.basket.v.failure('server', undefined, 'Paul')).not.toMatch(/erreur|échec/i);
  });
});
