import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { interpretTranscript, searchTermFor } from '../../shared/nlp/interpret.ts';
import type { InterpretedItem, Locale } from '../../shared/nlp/types.ts';

let n = 0;
const run = (transcript: string, locale: Locale = 'fr-CA', regionalDictionary = true, register: 'vous' | 'tu' = 'vous') =>
  interpretTranscript({
    utteranceId: 'u1',
    transcript,
    locale,
    capturedAt: '2026-10-28T14:00:00Z',
    fromOfflineQueue: false,
    regionalDictionary,
    register,
    newItemId: () => `i${(n += 1)}`,
  });

const summary = (i: InterpretedItem): string =>
  i.status === 'confirmed' ? `${i.quantity} ${i.unit} ${i.productKey}` : `? ${i.disambiguation.candidates.map((c) => c.normalizedProduct).join('|')}`;

const keys = (t: string, locale: Locale = 'fr-CA', regional = true): string[] => run(t, locale, regional).items.map(summary);

describe('analyse fr-CA', () => {
  it('quantités, unités, « pis » et hésitations', () => {
    assert.deepEqual(keys('Euh deux cartons de lait 2 % pis une douzaine d’œufs'), ['2 carton lait-2-2l', '1 dozen oeufs']);
  });

  it('auto-correction « deux… non, trois »', () => {
    assert.deepEqual(keys('Deux… non, trois yogourts et du café'), ['3 package yogourt', '1 package cafe']);
  });

  it('nombres composés et correction après le nom', () => {
    assert.deepEqual(keys('dix-huit yogourts pis vingt et un œufs'), ['18 package yogourt', '21 unit oeufs']);
    assert.deepEqual(keys('deux yogourts non trois et du café'), ['3 package yogourt', '1 package cafe']);
    assert.deepEqual(keys('deux yogourts, non trois'), ['3 package yogourt']);
    assert.deepEqual(keys('deux pommes non trois bananes'), ['3 unit bananes']);
    assert.deepEqual(keys('dix pommes'), ['10 bag pommes']);
  });

  it('demis et fractions pour les poids et les douzaines', () => {
    assert.deepEqual(keys('un demi kilo de bœuf haché'), ['0.5 kg boeuf-hache']);
    assert.deepEqual(keys('une demi-douzaine d’œufs'), ['0.5 dozen oeufs']);
    assert.deepEqual(keys('0,5 kg de carottes'), ['0.5 kg carottes']);
    const [item] = run('0,5 kg de carottes').items;
    assert.equal(item?.status === 'confirmed' ? item.productLabel : null, 'Carottes', 'format habituel retiré');
  });

  it('canettes : pas 24 bouteilles de 2 L', () => {
    const [item] = run('vingt-quatre canettes de liqueur').items;
    assert.equal(item ? summary(item) : null, '24 can boisson-gazeuse');
    assert.equal(item?.status === 'confirmed' ? item.packageSize : 'x', null);
  });

  it('libellé libre borné', () => {
    const [item] = run(`un ${'machin '.repeat(40)}`).items;
    assert.ok(item?.status === 'confirmed' && (item.productLabel ?? '').length <= 100);
  });

  it('dictionnaire québécois, désactivable', () => {
    assert.deepEqual(keys('Des bines pis une poche de patates'), ['1 can feves-lard', '1 bag pommes-terre']);
    const off = run('Des bines', 'fr-CA', false).items[0];
    assert.notEqual(off?.status === 'confirmed' ? off.productKey : null, 'feves-lard');
  });

  it('« une pinte de lait » : question 1, 2 ou 4 litres', () => {
    const [milk, chips] = run('Une pinte de lait pis des chips').items;
    assert.equal(milk?.status, 'pending_choice');
    if (milk?.status === 'pending_choice') {
      assert.deepEqual(milk.disambiguation.candidates.map((c) => c.normalizedProduct), ['lait-2-1l', 'lait-2-2l', 'lait-2-4l']);
      assert.match(milk.disambiguation.ttsPrompt, /1 litre, 2 litres ou 4 litres/);
    }
    assert.equal(chips?.status === 'confirmed' ? chips.productKey : null, 'croustilles');
  });

  it('erreur de reconnaissance « beur » : question, vouvoiement ou tutoiement', () => {
    const doubt = run('du beur').items[0];
    assert.equal(doubt?.status, 'pending_choice');
    if (doubt?.status === 'pending_choice') {
      assert.equal(doubt.disambiguation.candidates[0].normalizedProduct, 'beurre');
      assert.match(doubt.disambiguation.ttsPrompt, /^Pour un produit, je ne suis pas sûre\. Vouliez-vous du beurre/);
    }
    const tu = run('du beur', 'fr-CA', true, 'tu').items[0];
    if (tu?.status === 'pending_choice') assert.match(tu.disambiguation.ttsPrompt, /Voulais-tu/);
  });

  it('produit absent du lexique : gardé tel quel, avec ses accents', () => {
    const items = run('Je voudrais du jus de canneberge, du pâté chinois et du sirop d’érable maison').items;
    assert.deepEqual(items.map((i) => (i.status === 'confirmed' ? i.productLabel : '?')), ['Jus de canneberge', 'Pâté chinois', 'Sirop d’érable maison']);
    assert.ok(items.every((i) => i.status === 'confirmed' && i.productKey.startsWith('free:') && i.category === 'other'));
  });

  it('ne remplace pas un produit précis par un produit voisin', () => {
    const [item] = run('du lait au chocolat').items;
    assert.equal(item?.status === 'confirmed' ? item.productKey : null, 'free:lait-chocolat');
  });

  it('format dit : « deux litres de lait » = un carton de 2 L ; « 2 livres de carottes » = 2 lb', () => {
    assert.deepEqual(keys('deux litres de lait'), ['1 carton lait-2-2l']);
    assert.deepEqual(keys('2 livres de carottes'), ['2 lb carottes']);
  });

  it('« 12 œufs » : douze œufs, pas douze douzaines', () => {
    assert.deepEqual(keys('12 œufs'), ['12 unit oeufs']);
  });

  it('« et » à l’intérieur d’un nom ne coupe pas la phrase', () => {
    assert.deepEqual(keys('de la soupe au poulet et nouilles et du pain'), ['1 can soupe-poulet', '1 package pain-tranche']);
  });

  it('produit sensible : jamais deviné, toujours marqué', () => {
    const [item] = run('des tampons').items;
    assert.equal(item?.status, 'confirmed');
    assert.equal(item?.sensitive, true);
  });

  it('« l’eau » n’est pas « 1 litre d’eau »', () => {
    assert.deepEqual(keys("de l'eau"), ['1 case eau']);
  });

  it('texte nettoyé et phrase vide', () => {
    assert.equal(run('Euh deux cartons de lait 2 % pis une douzaine d’œufs').utterance.cleanTranscript, 'deux cartons de lait 2 %, une douzaine d’œufs');
    assert.deepEqual(run('euh… bon… ben').items, []);
  });
});

describe('analyse en-CA', () => {
  it('quantities, units and fillers', () => {
    assert.deepEqual(keys('Um two cartons of 2% milk and a dozen eggs', 'en-CA'), ['2 carton lait-2-2l', '1 dozen oeufs']);
  });

  it('polite phrases are dropped', () => {
    assert.deepEqual(keys('I need some bread, butter and a can of tomato soup please', 'en-CA'), [
      '1 package pain-tranche',
      '1 package beurre',
      '1 can soupe-tomate',
    ]);
  });

  it('Canadian English: bag of milk, homo milk, pop, two-four', () => {
    assert.deepEqual(keys('a bag of milk, pork and beans, homo milk, some pop and a two-four', 'en-CA'), [
      '1 carton lait-2-4l',
      '1 can feves-lard',
      '1 carton lait-entier-2l',
      '1 bottle boisson-gazeuse',
      '1 case biere',
    ]);
  });

  it('self-correction and free text', () => {
    assert.deepEqual(keys('two no three yogurts and cranberry juice', 'en-CA'), ['3 package yogourt', '1 unit free:cranberry-juice']);
  });

  it('compound numbers, halves, post-noun correction', () => {
    assert.deepEqual(keys('eighteen yogurts and twenty four cans of pop', 'en-CA'), ['18 package yogourt', '24 can boisson-gazeuse']);
    assert.deepEqual(keys('half a kilo of ground beef', 'en-CA'), ['0.5 kg boeuf-hache']);
    assert.deepEqual(keys('two yogurts no three', 'en-CA'), ['3 package yogourt']);
  });

  it('doubt prompt in English', () => {
    const [item] = run('budder', 'en-CA').items;
    if (item?.status === 'pending_choice') assert.match(item.disambiguation.ttsPrompt, /^I'm not sure about one item\. Did you mean butter/);
    else assert.fail('question attendue');
  });

  it('labels follow the language', () => {
    const [item] = run('butter', 'en-CA').items;
    assert.equal(item?.status === 'confirmed' ? item.productLabel : null, 'Salted butter, 454 g');
  });
});

describe('terme de recherche Instacart', () => {
  it('terme anglais pour un produit connu, libellé pour un produit libre', () => {
    assert.equal(searchTermFor('beurre', 'Beurre salé, 454 g'), 'salted butter');
    assert.equal(searchTermFor('free:pate-chinois', 'Pâté chinois'), 'pâté chinois');
  });
});
