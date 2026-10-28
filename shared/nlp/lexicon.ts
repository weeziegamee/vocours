/**
 * Lexique d'épicerie bilingue (fr-CA / en-CA), SANS PRIX.
 *
 * Il sert à reconnaître les produits courants, à leur donner un libellé propre, un rayon
 * (pictogramme), un format et un terme de recherche Instacart fiable. Un produit absent
 * du lexique n'est pas refusé : il est gardé tel qu'il a été dit (voir interpret.ts),
 * et Instacart fait lui-même la correspondance à partir de son nom.
 *
 * `qc` : expressions propres au français québécois, ignorées si l'aidant désactive le
 * dictionnaire régional. Les synonymes peuvent garder accents et apostrophes : ils sont
 * normalisés au chargement.
 */

import type { Category, PackageSize, Unit } from './types.ts';

export interface LexiconEntry {
  readonly key: string;
  readonly category: Category;
  readonly unit: Unit;
  readonly packageSize: PackageSize | null;
  readonly sensitive: boolean;
  readonly label: { readonly fr: string; readonly en: string };
  /** Forme parlée pour les questions de doute : « du beurre » / « butter ». */
  readonly spoken: { readonly fr: string; readonly en: string };
  /** Terme envoyé à Instacart comme `name` (recherche catalogue). */
  readonly search: string;
  readonly synonyms: { readonly fr: readonly string[]; readonly en: readonly string[] };
  readonly qc: readonly string[];
}

type Side = readonly [label: string, spoken: string, synonyms: readonly string[]];

const L = (v: number): PackageSize => ({ value: v, unit: 'L' });
const ml = (v: number): PackageSize => ({ value: v, unit: 'mL' });
const g = (v: number): PackageSize => ({ value: v, unit: 'g' });
const kg = (v: number): PackageSize => ({ value: v, unit: 'kg' });
const lb = (v: number): PackageSize => ({ value: v, unit: 'lb' });

const e = (
  key: string,
  category: Category,
  unit: Unit,
  packageSize: PackageSize | null,
  fr: Side,
  en: Side,
  opts: { readonly qc?: readonly string[]; readonly sensitive?: boolean; readonly search?: string } = {},
): LexiconEntry => ({
  key,
  category,
  unit,
  packageSize,
  sensitive: opts.sensitive ?? false,
  label: { fr: fr[0], en: en[0] },
  spoken: { fr: fr[1], en: en[1] },
  search: opts.search ?? (en[0].split(',')[0] ?? en[0]).toLowerCase(),
  synonyms: { fr: fr[2], en: en[2] },
  qc: opts.qc ?? [],
});

export const LEXICON: readonly LexiconEntry[] = [
  /* ------------------------------ Crèmerie ------------------------------ */
  e('lait-2-1l', 'dairy', 'carton', L(1),
    ['Lait 2 %, 1 L', 'du lait 1 litre', ['lait 1 litre', 'lait un litre', 'lait 2 1 litre']],
    ['2% milk, 1 L', '1 litre of milk', ['milk 1 litre', 'milk 1 liter', 'milk one litre']]),
  e('lait-2-2l', 'dairy', 'carton', L(2),
    ['Lait 2 %, 2 L', 'du lait 2 litres', ['lait', 'lait 2', 'lait 2 %', 'lait deux', 'lait 2 litres', 'lait deux litres', 'lait 2 % 2 litres']],
    ['2% milk, 2 L', '2 litres of milk', ['milk', '2 milk', '2% milk', 'two percent milk', 'milk 2 litres', 'milk 2 liters', 'milk two litres']]),
  e('lait-2-4l', 'dairy', 'carton', L(4),
    ['Lait 2 %, 4 L', 'du lait 4 litres', ['lait 4 litres', 'lait quatre litres', 'sac de lait', 'sacs de lait']],
    ['2% milk, 4 L', '4 litres of milk', ['milk 4 litres', 'milk 4 liters', 'bag of milk', 'bags of milk', 'milk bags']],
    { qc: ['gallon de lait'] }),
  e('lait-entier-2l', 'dairy', 'carton', L(2),
    ['Lait entier 3,25 %, 2 L', 'du lait entier', ['lait entier', 'lait 3,25 %', 'lait homogénéisé']],
    ['Homogenized milk 3.25%, 2 L', 'whole milk', ['whole milk', 'homo milk', 'homogenized milk', '3.25% milk']],
    { search: 'homogenized milk 3.25%' }),
  e('lait-ecreme-2l', 'dairy', 'carton', L(2),
    ['Lait écrémé, 2 L', 'du lait écrémé', ['lait écrémé', 'lait 0 %', 'lait sans gras']],
    ['Skim milk, 2 L', 'skim milk', ['skim milk', 'skimmed milk', 'fat free milk']]),
  e('creme-cafe', 'dairy', 'carton', ml(473),
    ['Crème à café 10 %, 473 mL', 'de la crème à café', ['crème à café', 'crème café', 'crème 10 %', 'crème']],
    ['10% cream, 473 mL', 'coffee cream', ['coffee cream', 'table cream', 'cream', 'half and half', '10% cream']]),
  e('beurre', 'dairy', 'package', g(454),
    ['Beurre salé, 454 g', 'du beurre', ['beurre', 'beurre salé']],
    ['Salted butter, 454 g', 'butter', ['butter', 'salted butter']]),
  e('margarine', 'dairy', 'package', g(907),
    ['Margarine, 907 g', 'de la margarine', ['margarine']],
    ['Margarine, 907 g', 'margarine', ['margarine']]),
  e('oeufs', 'dairy', 'dozen', null,
    ['Œufs gros', 'des œufs', ['œufs', 'oeufs', 'œuf', 'oeuf', 'douzaine d’œufs']],
    ['Large eggs', 'eggs', ['eggs', 'egg', 'large eggs', 'dozen eggs']],
    { search: 'large eggs' }),
  e('yogourt', 'dairy', 'package', g(750),
    ['Yogourt nature, 750 g', 'du yogourt', ['yogourt', 'yogourts', 'yaourt', 'yaourts', 'yogourt nature']],
    ['Plain yogurt, 750 g', 'yogurt', ['yogurt', 'yogurts', 'yoghurt', 'plain yogurt']]),
  e('cheddar', 'dairy', 'package', g(400),
    ['Fromage cheddar, 400 g', 'du cheddar', ['cheddar', 'fromage', 'fromage cheddar']],
    ['Cheddar cheese, 400 g', 'cheddar', ['cheddar', 'cheese', 'cheddar cheese']]),
  e('fromage-grains', 'dairy', 'bag', g(300),
    ['Fromage en grains, 300 g', 'du fromage en grains', ['fromage en grains']],
    ['Cheese curds, 300 g', 'cheese curds', ['cheese curds', 'curds', 'squeaky cheese']],
    { qc: ['fromage en crottes', 'crottes de fromage'] }),
  e('mozzarella', 'dairy', 'package', g(340),
    ['Fromage mozzarella, 340 g', 'de la mozzarella', ['mozzarella', 'fromage mozzarella']],
    ['Mozzarella cheese, 340 g', 'mozzarella', ['mozzarella', 'mozzarella cheese']]),

  /* ----------------------------- Boulangerie ---------------------------- */
  e('pain-tranche', 'bakery', 'package', g(675),
    ['Pain tranché blanc', 'du pain tranché', ['pain tranché', 'pain', 'pain blanc', 'pain blanc tranché']],
    ['Sliced white bread', 'sliced bread', ['bread', 'sliced bread', 'white bread', 'loaf of bread']]),
  e('pain-ble-entier', 'bakery', 'package', g(675),
    ['Pain de blé entier', 'du pain de blé entier', ['pain de blé entier', 'pain blé entier', 'pain brun']],
    ['Whole wheat bread', 'whole wheat bread', ['whole wheat bread', 'brown bread', 'wheat bread']]),
  e('baguette', 'bakery', 'unit', null,
    ['Baguette', 'une baguette', ['baguette', 'baguettes']],
    ['Baguette', 'a baguette', ['baguette', 'baguettes', 'french stick']]),
  e('muffins-anglais', 'bakery', 'package', null,
    ['Muffins anglais', 'des muffins anglais', ['muffins anglais', 'muffin anglais']],
    ['English muffins', 'English muffins', ['english muffins', 'english muffin']]),
  e('croissants', 'bakery', 'package', null,
    ['Croissants', 'des croissants', ['croissants', 'croissant']],
    ['Croissants', 'croissants', ['croissants', 'croissant']]),
  e('biscottes', 'bakery', 'box', null,
    ['Biscottes', 'des biscottes', ['biscottes', 'biscotte']],
    ['Melba toast', 'melba toast', ['melba toast', 'rusks', 'rusk']]),

  /* ------------------------------ Épicerie ------------------------------ */
  e('cafe', 'pantry', 'package', g(300),
    ['Café moulu, 300 g', 'du café', ['café', 'café moulu']],
    ['Ground coffee, 300 g', 'coffee', ['coffee', 'ground coffee']]),
  e('the', 'pantry', 'box', null,
    ['Thé noir, 72 sachets', 'du thé', ['thé', 'thé noir', 'sachets de thé', 'poches de thé']],
    ['Black tea, 72 bags', 'tea', ['tea', 'black tea', 'tea bags']]),
  e('cereales', 'pantry', 'box', null,
    ['Céréales de flocons de maïs', 'des céréales', ['céréales', 'corn flakes', 'flocons de maïs']],
    ['Corn flakes cereal', 'cereal', ['cereal', 'corn flakes', 'breakfast cereal']]),
  e('gruau', 'pantry', 'package', kg(1),
    ['Gruau à cuisson rapide, 1 kg', 'du gruau', ['gruau', 'flocons d’avoine', 'avoine']],
    ['Quick oats, 1 kg', 'oatmeal', ['oatmeal', 'oats', 'porridge', 'quick oats']]),
  e('feves-lard', 'pantry', 'can', ml(398),
    ['Fèves au lard, 398 mL', 'des fèves au lard', ['fèves au lard']],
    ['Baked beans, 398 mL', 'baked beans', ['baked beans', 'beans', 'pork and beans']],
    { qc: ['bines', 'beans'] }),
  e('soupe-tomate', 'pantry', 'can', ml(284),
    ['Soupe aux tomates, 284 mL', 'de la soupe aux tomates', ['soupe aux tomates', 'soupe tomate', 'soupe']],
    ['Tomato soup, 284 mL', 'tomato soup', ['tomato soup', 'soup']]),
  e('soupe-poulet', 'pantry', 'can', ml(284),
    ['Soupe poulet et nouilles, 284 mL', 'de la soupe poulet et nouilles', ['soupe poulet et nouilles', 'soupe au poulet et nouilles', 'soupe au poulet', 'soupe poulet']],
    ['Chicken noodle soup, 284 mL', 'chicken noodle soup', ['chicken noodle soup', 'chicken soup']]),
  e('spaghetti', 'pantry', 'package', g(900),
    ['Spaghetti, 900 g', 'du spaghetti', ['spaghetti', 'pâtes', 'pâtes alimentaires']],
    ['Spaghetti, 900 g', 'spaghetti', ['spaghetti', 'pasta', 'noodles']]),
  e('sauce-pates', 'pantry', 'jar', ml(650),
    ['Sauce pour pâtes, 650 mL', 'de la sauce pour pâtes', ['sauce à spaghetti', 'sauce tomate', 'sauce pour pâtes']],
    ['Pasta sauce, 650 mL', 'pasta sauce', ['pasta sauce', 'spaghetti sauce', 'tomato sauce']]),
  e('riz', 'pantry', 'bag', kg(2),
    ['Riz blanc, 2 kg', 'du riz', ['riz', 'riz blanc']],
    ['White rice, 2 kg', 'rice', ['rice', 'white rice']]),
  e('farine', 'pantry', 'bag', kg(2.5),
    ['Farine tout usage, 2,5 kg', 'de la farine', ['farine', 'farine tout usage']],
    ['All-purpose flour, 2.5 kg', 'flour', ['flour', 'all purpose flour']]),
  e('sucre', 'pantry', 'bag', kg(2),
    ['Sucre blanc, 2 kg', 'du sucre', ['sucre', 'sucre blanc']],
    ['White sugar, 2 kg', 'sugar', ['sugar', 'white sugar']]),
  e('sel', 'pantry', 'box', kg(1),
    ['Sel de table, 1 kg', 'du sel', ['sel', 'sel de table']],
    ['Table salt, 1 kg', 'salt', ['salt', 'table salt']]),
  e('huile', 'pantry', 'bottle', L(1),
    ['Huile de canola, 1 L', 'de l’huile', ['huile', 'huile de canola', 'huile végétale']],
    ['Canola oil, 1 L', 'oil', ['oil', 'canola oil', 'vegetable oil', 'cooking oil']]),
  e('beurre-arachide', 'pantry', 'jar', kg(1),
    ['Beurre d’arachide, 1 kg', 'du beurre d’arachide', ['beurre d’arachide', 'beurre d arachides']],
    ['Peanut butter, 1 kg', 'peanut butter', ['peanut butter']],
    { qc: ['beurre de peanut', 'beurre de pinottes'] }),
  e('confiture', 'pantry', 'jar', ml(500),
    ['Confiture de fraises, 500 mL', 'de la confiture', ['confiture', 'confitures', 'confiture de fraises']],
    ['Strawberry jam, 500 mL', 'jam', ['jam', 'strawberry jam']]),
  e('sirop-erable', 'pantry', 'can', ml(540),
    ['Sirop d’érable, 540 mL', 'du sirop d’érable', ['sirop d’érable', 'sirop']],
    ['Maple syrup, 540 mL', 'maple syrup', ['maple syrup', 'syrup']]),
  e('miel', 'pantry', 'jar', g(500),
    ['Miel, 500 g', 'du miel', ['miel']],
    ['Honey, 500 g', 'honey', ['honey']]),
  e('thon', 'pantry', 'can', g(170),
    ['Thon en conserve, 170 g', 'du thon', ['thon', 'thon en conserve', 'thon pâle']],
    ['Canned tuna, 170 g', 'tuna', ['tuna', 'canned tuna', 'tin of tuna']]),
  e('ketchup', 'pantry', 'bottle', L(1),
    ['Ketchup, 1 L', 'du ketchup', ['ketchup']],
    ['Ketchup, 1 L', 'ketchup', ['ketchup']]),
  e('moutarde', 'pantry', 'bottle', ml(400),
    ['Moutarde jaune, 400 mL', 'de la moutarde', ['moutarde', 'moutarde jaune']],
    ['Yellow mustard, 400 mL', 'mustard', ['mustard', 'yellow mustard']]),
  e('mayonnaise', 'pantry', 'jar', ml(890),
    ['Mayonnaise, 890 mL', 'de la mayonnaise', ['mayonnaise', 'mayo']],
    ['Mayonnaise, 890 mL', 'mayonnaise', ['mayonnaise', 'mayo']]),
  e('craquelins', 'pantry', 'box', null,
    ['Craquelins soda', 'des craquelins', ['craquelins', 'biscuits soda', 'craquelins soda']],
    ['Soda crackers', 'crackers', ['crackers', 'soda crackers', 'saltines']]),
  e('biscuits', 'snacks', 'package', null,
    ['Biscuits aux brisures de chocolat', 'des biscuits', ['biscuits', 'biscuit', 'biscuits au chocolat']],
    ['Chocolate chip cookies', 'cookies', ['cookies', 'cookie', 'chocolate chip cookies']]),

  /* ----------------------- Charcuterie et viandes ----------------------- */
  e('cretons', 'deli', 'package', g(200),
    ['Cretons, 200 g', 'des cretons', ['cretons', 'creton']],
    ['Cretons, 200 g', 'cretons', ['cretons', 'creton', 'pork spread']]),
  e('jambon', 'deli', 'package', g(175),
    ['Jambon tranché, 175 g', 'du jambon', ['jambon', 'jambon tranché']],
    ['Sliced ham, 175 g', 'ham', ['ham', 'sliced ham']]),
  e('poulet', 'meat', 'package', null,
    ['Poitrines de poulet', 'du poulet', ['poulet', 'poitrines de poulet', 'poitrine de poulet']],
    ['Chicken breasts', 'chicken', ['chicken', 'chicken breast', 'chicken breasts']]),
  e('boeuf-hache', 'meat', 'package', g(454),
    ['Bœuf haché mi-maigre, 454 g', 'du bœuf haché', ['bœuf haché', 'boeuf haché', 'viande hachée', 'steak haché']],
    ['Medium ground beef, 454 g', 'ground beef', ['ground beef', 'hamburger meat', 'minced beef']]),
  e('saucisses', 'meat', 'package', null,
    ['Saucisses fumées', 'des saucisses', ['saucisses', 'saucisse', 'saucisses à hot dog', 'hot dogs']],
    ['Wieners', 'hot dogs', ['hot dogs', 'wieners', 'sausages', 'sausage']]),
  e('bacon', 'meat', 'package', g(375),
    ['Bacon, 375 g', 'du bacon', ['bacon']],
    ['Bacon, 375 g', 'bacon', ['bacon']]),

  /* ------------------------------ Boissons ------------------------------ */
  e('jus-orange', 'beverages', 'carton', L(1.75),
    ['Jus d’orange, 1,75 L', 'du jus d’orange', ['jus d’orange', 'jus']],
    ['Orange juice, 1.75 L', 'orange juice', ['orange juice', 'juice', 'oj']]),
  e('jus-pomme', 'beverages', 'carton', L(1.89),
    ['Jus de pomme, 1,89 L', 'du jus de pomme', ['jus de pomme', 'jus de pommes']],
    ['Apple juice, 1.89 L', 'apple juice', ['apple juice']]),
  e('eau', 'beverages', 'case', null,
    ['Eau de source, 24 × 500 mL', 'de l’eau', ['eau', 'bouteilles d’eau', 'eau de source', 'eau en bouteille']],
    ['Spring water, 24 × 500 mL', 'water', ['water', 'bottled water', 'spring water']]),
  e('boisson-gazeuse', 'beverages', 'bottle', L(2),
    ['Boisson gazeuse, 2 L', 'de la boisson gazeuse', ['boisson gazeuse', 'cola', 'boissons gazeuses']],
    ['Soft drink, 2 L', 'pop', ['pop', 'soda', 'soft drink', 'cola', 'coke']],
    { qc: ['liqueur', 'liqueurs', 'coke'] }),
  e('biere', 'beverages', 'case', null,
    ['Bière blonde, 6 canettes', 'de la bière', ['bière', 'bières', 'bière blonde']],
    ['Lager beer, 6 cans', 'beer', ['beer', 'beers', 'lager', 'two four']]),

  /* -------------------------- Fruits et légumes ------------------------- */
  e('pommes-terre', 'produce', 'bag', lb(10),
    ['Pommes de terre, 10 lb', 'des pommes de terre', ['pommes de terre', 'pomme de terre']],
    ['Potatoes, 10 lb', 'potatoes', ['potatoes', 'potato', 'bag of potatoes']],
    { qc: ['patates', 'poche de patates', 'patate'] }),
  e('bananes', 'produce', 'unit', null,
    ['Bananes', 'des bananes', ['bananes', 'banane']],
    ['Bananas', 'bananas', ['bananas', 'banana']]),
  e('pommes', 'produce', 'bag', lb(3),
    ['Pommes McIntosh, 3 lb', 'des pommes', ['pommes', 'pomme', 'pommes mcintosh']],
    ['McIntosh apples, 3 lb', 'apples', ['apples', 'apple', 'mcintosh apples']]),
  e('oranges', 'produce', 'bag', lb(3),
    ['Oranges, 3 lb', 'des oranges', ['oranges', 'orange']],
    ['Oranges, 3 lb', 'oranges', ['oranges', 'orange']]),
  e('carottes', 'produce', 'bag', lb(2),
    ['Carottes, 2 lb', 'des carottes', ['carottes', 'carotte']],
    ['Carrots, 2 lb', 'carrots', ['carrots', 'carrot']]),
  e('oignons', 'produce', 'bag', lb(3),
    ['Oignons jaunes, 3 lb', 'des oignons', ['oignons', 'oignon']],
    ['Yellow onions, 3 lb', 'onions', ['onions', 'onion']]),
  e('tomates', 'produce', 'unit', null,
    ['Tomates', 'des tomates', ['tomates', 'tomate']],
    ['Tomatoes', 'tomatoes', ['tomatoes', 'tomato']]),
  e('laitue', 'produce', 'head', null,
    ['Laitue romaine', 'de la laitue', ['laitue', 'salade', 'laitue romaine']],
    ['Romaine lettuce', 'lettuce', ['lettuce', 'romaine', 'salad']]),
  e('concombre', 'produce', 'unit', null,
    ['Concombre anglais', 'un concombre', ['concombre', 'concombres']],
    ['English cucumber', 'cucumber', ['cucumber', 'cucumbers']]),
  e('brocoli', 'produce', 'head', null,
    ['Brocoli', 'du brocoli', ['brocoli', 'brocolis']],
    ['Broccoli', 'broccoli', ['broccoli']]),
  e('celeri', 'produce', 'unit', null,
    ['Céleri', 'du céleri', ['céleri']],
    ['Celery', 'celery', ['celery']]),
  e('fraises', 'produce', 'package', g(454),
    ['Fraises, 454 g', 'des fraises', ['fraises', 'fraise']],
    ['Strawberries, 454 g', 'strawberries', ['strawberries', 'strawberry']]),
  e('raisins', 'produce', 'package', null,
    ['Raisins verts', 'des raisins', ['raisins', 'raisin']],
    ['Green grapes', 'grapes', ['grapes', 'grape']]),
  e('citrons', 'produce', 'unit', null,
    ['Citrons', 'des citrons', ['citrons', 'citron']],
    ['Lemons', 'lemons', ['lemons', 'lemon']]),

  /* ------------------------------ Surgelés ------------------------------ */
  e('legumes-surgeles', 'frozen', 'bag', kg(1),
    ['Légumes surgelés, 1 kg', 'des légumes surgelés', ['légumes surgelés', 'légumes congelés', 'macédoine']],
    ['Frozen mixed vegetables, 1 kg', 'frozen vegetables', ['frozen vegetables', 'frozen veggies', 'mixed vegetables']]),
  e('creme-glacee', 'frozen', 'package', L(1.5),
    ['Crème glacée à la vanille, 1,5 L', 'de la crème glacée', ['crème glacée', 'crème glacée vanille']],
    ['Vanilla ice cream, 1.5 L', 'ice cream', ['ice cream', 'vanilla ice cream']]),
  e('pizza-surgelee', 'frozen', 'box', null,
    ['Pizza surgelée', 'une pizza surgelée', ['pizza', 'pizza surgelée', 'pizza congelée']],
    ['Frozen pizza', 'frozen pizza', ['pizza', 'frozen pizza']]),

  /* ------------------------------ Collations ---------------------------- */
  e('croustilles', 'snacks', 'bag', g(200),
    ['Croustilles nature, 200 g', 'des croustilles', ['croustilles']],
    ['Plain potato chips, 200 g', 'chips', ['chips', 'potato chips']],
    { qc: ['chips'] }),
  e('chocolat', 'snacks', 'unit', null,
    ['Tablette de chocolat au lait', 'du chocolat', ['chocolat', 'barre de chocolat', 'tablette de chocolat']],
    ['Milk chocolate bar', 'chocolate', ['chocolate', 'chocolate bar']]),

  /* ------------------------------- Maison ------------------------------- */
  e('papier-hygienique', 'household', 'package', null,
    ['Papier hygiénique, 12 rouleaux', 'du papier hygiénique', ['papier hygiénique', 'papier de toilette']],
    ['Bathroom tissue, 12 rolls', 'toilet paper', ['toilet paper', 'toilet tissue', 'bathroom tissue']]),
  e('essuie-tout', 'household', 'package', null,
    ['Essuie-tout, 6 rouleaux', 'de l’essuie-tout', ['essuie tout', 'papier essuie tout']],
    ['Paper towels, 6 rolls', 'paper towels', ['paper towels', 'paper towel']]),
  e('savon-vaisselle', 'household', 'bottle', ml(740),
    ['Savon à vaisselle, 740 mL', 'du savon à vaisselle', ['savon à vaisselle', 'liquide à vaisselle']],
    ['Dish soap, 740 mL', 'dish soap', ['dish soap', 'dishwashing liquid']]),
  e('detergent', 'household', 'bottle', L(2.95),
    ['Détergent à lessive, 2,95 L', 'du détergent à lessive', ['détergent', 'détergent à lessive', 'savon à linge']],
    ['Laundry detergent, 2.95 L', 'laundry detergent', ['laundry detergent', 'detergent', 'laundry soap']]),
  e('mouchoirs', 'household', 'box', null,
    ['Papiers-mouchoirs', 'des mouchoirs', ['mouchoirs', 'papiers mouchoirs', 'kleenex']],
    ['Facial tissues', 'tissues', ['tissues', 'facial tissue', 'kleenex']]),

  /* --------------------------- Soins personnels ------------------------- */
  e('dentifrice', 'personal_care', 'unit', ml(100),
    ['Dentifrice, 100 mL', 'du dentifrice', ['dentifrice', 'pâte à dents']],
    ['Toothpaste, 100 mL', 'toothpaste', ['toothpaste']]),
  e('savon', 'personal_care', 'package', null,
    ['Pains de savon', 'du savon', ['savon', 'pain de savon', 'savon pour les mains']],
    ['Bar soap', 'soap', ['soap', 'bar soap', 'hand soap']]),
  e('shampoing', 'personal_care', 'bottle', ml(400),
    ['Shampoing, 400 mL', 'du shampoing', ['shampoing', 'shampooing', 'shampoo']],
    ['Shampoo, 400 mL', 'shampoo', ['shampoo']]),
  e('protections-incontinence', 'personal_care', 'package', null,
    ['Sous-vêtements d’incontinence', 'des sous-vêtements d’incontinence', ['sous vêtements d’incontinence', 'culottes d’incontinence', 'protections pour incontinence', 'depends']],
    ['Incontinence underwear', 'incontinence underwear', ['incontinence underwear', 'adult diapers', 'depends']],
    { sensitive: true }),
];

/**
 * Mots qui signalent un produit sensible (santé implicite, avenant CA-3.3), pour les
 * produits libres absents du lexique : jamais de suggestion, de statistique ni de nom
 * dans les notifications.
 */
export const SENSITIVE_WORDS: readonly string[] = [
  // français
  'incontinence', 'couche pour adulte', 'couches pour adulte', 'test de grossesse', 'preservatif', 'preservatifs',
  'condom', 'condoms', 'lubrifiant', 'tampon', 'tampons', 'serviette hygienique', 'serviettes hygieniques',
  'laxatif', 'laxatifs', 'sans gluten', 'diabetique', 'medicament', 'medicaments', 'pharmacie', 'vitamine',
  'vitamines', 'supplement', 'supplements', 'antiacide', 'hemorroides', 'protege dessous',
  // anglais
  'adult diaper', 'adult diapers', 'pregnancy test', 'lubricant', 'sanitary pad', 'sanitary pads', 'laxative',
  'gluten free', 'diabetic', 'medication', 'medicine', 'pharmacy', 'vitamin', 'vitamins', 'supplement',
  'supplements', 'antacid', 'hemorrhoid', 'panty liner', 'panty liners',
];

export const findEntry = (key: string): LexiconEntry | undefined => LEXICON.find((x) => x.key === key);
