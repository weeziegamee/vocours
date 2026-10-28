/**
 * Analyse d'une dictée d'épicerie, en français canadien ou en anglais canadien.
 *
 * Étapes : découpage en produits (« et », « pis », « and », virgules…), retrait des
 * hésitations et formules de politesse, auto-corrections (« deux… non, trois »),
 * quantité, unité ou format (« deux litres de lait »), puis rapprochement avec le
 * lexique :
 *  - correspondance sûre (≥ 0,80) → produit confirmé ;
 *  - correspondance hésitante (0,55 à 0,80) → question à 3 choix au plus ;
 *  - aucune correspondance → produit gardé tel qu'il a été dit (« Pâté chinois »),
 *    Instacart se chargeant de trouver l'article à partir de son nom.
 *
 * Fonction pure, sans dépendance : utilisée par le serveur et par le mode démonstration.
 */

import type {
  Candidate,
  Candidates,
  Category,
  ConfirmedOut,
  InterpretInput,
  InterpretOutput,
  InterpretedItem,
  Locale,
  PackageSize,
  PendingOut,
  Register,
  SizeUnit,
  Unit,
} from './types.ts';
import { LEXICON, SENSITIVE_WORDS, type LexiconEntry } from './lexicon.ts';

export const DOUBT_THRESHOLD = 0.8;
const FREE_TEXT_BELOW = 0.55;
const CANDIDATE_MIN = 0.45;
export const MAX_ITEM_QUANTITY = 50;

type Lang = 'fr' | 'en';
const langOf = (locale: Locale): Lang => (locale === 'en-CA' ? 'en' : 'fr');

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/** Minuscules, sans accents ni ligatures : « Œufs » → « oeufs ». */
export const normalizeWord = (s: string): string =>
  s
    .replace(/[ʼ'’`]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

interface Tok {
  readonly orig: string;
  readonly norm: string;
}

const BOUNDARY = '|';
/** Apostrophe d'élision gardée dans le mot (« d’ », « l’ ») pour réafficher le texte dit. */
const ELISION = 'ʼ';

/** Découpe le texte en mots ; virgules, points et points-virgules deviennent des frontières. */
export const tokenize = (text: string): Tok[] =>
  text
    .replace(/(\d),(\d)/g, '$1.$2') // « 1,5 litre »
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '$1pct') // « 2 % » reste attaché : « lait 2pct »
    .replace(/[,;.!?…]+(?!\d)/g, ` ${BOUNDARY} `)
    .replace(/([a-z])['’`]s\b/gi, `$1${ELISION}s`) // « Jack’s » reste un seul mot
    .replace(/(^|[\s|])(qu|[dljnmtsc])['’`]/gi, `$1$2${ELISION} `) // « d’œufs » → « dʼ œufs »
    .replace(/['’`]/g, ' ')
    .replace(/[%()"«»“”:/\\-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '')
    .map((w) => ({ orig: w, norm: w === BOUNDARY ? BOUNDARY : normalizeWord(w) }));

/** Texte dit, réassemblé : « d’œufs », « lait 2 % ». */
const joinOrig = (toks: readonly Tok[]): string =>
  toks
    .map((t) => t.orig.replace(/(\d)pct$/, '$1 %'))
    .reduce((acc, w) => (acc === '' ? w : acc.endsWith(ELISION) ? acc + w : `${acc} ${w}`), '')
    .replace(new RegExp(ELISION, 'g'), '’');

const normPhrase = (s: string): string[] =>
  tokenize(s)
    .map((t) => t.norm)
    .filter((w) => w !== BOUNDARY);

/* -------------------------------------------------------------------------- */
/* Vocabulaire de découpage                                                   */
/* -------------------------------------------------------------------------- */

const NUMBERS: Readonly<Record<Lang, Readonly<Record<string, number>>>> = {
  fr: {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20,
  },
  en: {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20,
  },
};

/** Dizaines et unités pour les nombres composés : « dix-huit », « vingt-quatre », « twenty four ». */
const TENS: Readonly<Record<Lang, Readonly<Record<string, number>>>> = {
  fr: { dix: 10, vingt: 20, trente: 30, quarante: 40, cinquante: 50 },
  en: { twenty: 20, thirty: 30, forty: 40, fifty: 50 },
};
const UNITS_1_9: Readonly<Record<Lang, Readonly<Record<string, number>>>> = {
  fr: { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9 },
  en: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 },
};

/** Fusionne « vingt et un », « dix huit », « twenty four » en un seul mot-nombre. */
const mergeCompoundNumbers = (toks: readonly Tok[], lang: Lang): Tok[] => {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (!t) continue;
    const tens = TENS[lang][t.norm];
    if (tens !== undefined) {
      const hasEt = toks[i + 1]?.norm === (lang === 'fr' ? 'et' : 'and');
      const u = toks[i + (hasEt ? 2 : 1)];
      const unit = u ? UNITS_1_9[lang][u.norm] : undefined;
      // « dix » ne se combine qu'avec sept, huit, neuf ; « et » seulement devant « un ».
      const ok = unit !== undefined && (tens !== 10 || unit >= 7) && (!hasEt || unit === 1) && !(tens === 10 && hasEt);
      if (ok && u) {
        const span = toks.slice(i, i + (hasEt ? 3 : 2));
        out.push({ orig: span.map((x) => x.orig).join('-'), norm: String(tens + unit) });
        i += hasEt ? 2 : 1;
        continue;
      }
      // « trente œufs », « forty cans » : dizaine seule.
      out.push({ orig: t.orig, norm: String(tens) });
      continue;
    }
    out.push(t);
  }
  return out;
};

const UNITS: Readonly<Record<Lang, Readonly<Record<string, Unit>>>> = {
  fr: {
    carton: 'carton', cartons: 'carton', sac: 'bag', sacs: 'bag', poche: 'bag', poches: 'bag',
    boite: 'can', boites: 'can', canette: 'can', canettes: 'can', canne: 'can', cannes: 'can', conserve: 'can', conserves: 'can',
    pot: 'jar', pots: 'jar', bouteille: 'bottle', bouteilles: 'bottle', paquet: 'package', paquets: 'package',
    contenant: 'package', contenants: 'package', douzaine: 'dozen', douzaines: 'dozen', caisse: 'case',
    caisses: 'case', botte: 'bunch', bottes: 'bunch', tete: 'head', tetes: 'head',
    livre: 'lb', livres: 'lb', lb: 'lb', litre: 'L', litres: 'L', l: 'L', kilo: 'kg', kilos: 'kg', kg: 'kg',
    gramme: 'g', grammes: 'g', g: 'g', millilitres: 'mL', ml: 'mL',
  },
  en: {
    carton: 'carton', cartons: 'carton', bag: 'bag', bags: 'bag', can: 'can', cans: 'can', tin: 'can',
    tins: 'can', box: 'box', boxes: 'box', jar: 'jar', jars: 'jar', bottle: 'bottle', bottles: 'bottle',
    pack: 'package', packs: 'package', package: 'package', packages: 'package', packet: 'package',
    packets: 'package', loaf: 'package', loaves: 'package', dozen: 'dozen', dozens: 'dozen', case: 'case',
    cases: 'case', bunch: 'bunch', bunches: 'bunch', head: 'head', heads: 'head', pound: 'lb', pounds: 'lb',
    lb: 'lb', lbs: 'lb', litre: 'L', litres: 'L', liter: 'L', liters: 'L', l: 'L', kilo: 'kg', kilos: 'kg',
    kg: 'kg', gram: 'g', grams: 'g', g: 'g', ml: 'mL', millilitres: 'mL', milliliters: 'mL',
  },
};

const SIZE_UNITS: ReadonlySet<Unit> = new Set<Unit>(['g', 'kg', 'lb', 'mL', 'L']);
const SIZE_WORD: Readonly<Record<Lang, Readonly<Record<SizeUnit, string>>>> = {
  fr: { L: 'litres', kg: 'kilos', g: 'grammes', lb: 'livres', mL: 'ml' },
  en: { L: 'litres', kg: 'kilos', g: 'grams', lb: 'pounds', mL: 'ml' },
};

const ARTICLES: Readonly<Record<Lang, ReadonlySet<string>>> = {
  fr: new Set(['du', 'de', 'des', 'd', 'le', 'la', 'les', 'l', 'aux', 'au', 'en', 'a']),
  en: new Set(['the', 'some', 'of', 'a', 'an']),
};

const FILLERS: Readonly<Record<Lang, ReadonlySet<string>>> = {
  fr: new Set(['euh', 'heu', 'hum', 'ben', 'bon', 'attends', 'attendez', 'coudonc', 'mettons', 'genre', 'voyons', 'svp', 'merci']),
  en: new Set(['um', 'uh', 'er', 'erm', 'hmm', 'okay', 'ok', 'please', 'thanks']),
};

/** Formules retirées où qu'elles soient (« je voudrais », « I need »…), en mots normalisés. */
const PHRASES_TO_DROP: Readonly<Record<Lang, readonly (readonly string[])[]>> = {
  fr: [
    ['s', 'il', 'vous', 'plait'], ['s', 'il', 'te', 'plait'], ['il', 'me', 'faudrait'], ['il', 'me', 'faut'],
    ['j', 'aurais', 'besoin'], ['j', 'ai', 'besoin'], ['je', 'voudrais'], ['j', 'aimerais'], ['je', 'veux'],
    ['peux', 'tu', 'ajouter'], ['pouvez', 'vous', 'ajouter'], ['ajoute'], ['ajoutez'], ['ajouter'],
    ['mets'], ['mettez'], ['prends'], ['prenez'],
  ],
  en: [
    ['can', 'you', 'add'], ['could', 'you', 'add'], ['i', 'would', 'like'], ['i', 'd', 'like'], ['i', 'need'],
    ['i', 'want'], ['we', 'need'], ['get', 'me'], ['add'], ['buy'],
  ],
};

/** Séparateurs de produits. Les plus longs d'abord. */
const CONNECTORS: Readonly<Record<Lang, readonly (readonly string[])[]>> = {
  fr: [['pis', 'aussi'], ['et', 'puis'], ['avec', 'ca'], ['et', 'aussi'], ['pis'], ['puis'], ['et'], ['aussi'], ['ensuite']],
  en: [['and', 'also'], ['and', 'then'], ['as', 'well', 'as'], ['and'], ['also'], ['plus'], ['then']],
};

const CORRECTION: Readonly<Record<Lang, ReadonlySet<string>>> = {
  fr: new Set(['non']),
  en: new Set(['no', 'sorry']),
};

const HALF: ReadonlySet<string> = new Set(['demi', 'demie', 'half']);

const isNumberTok = (w: string, lang: Lang): boolean => w in NUMBERS[lang] || /^\d+(\.\d+)?$/.test(w);
const numberOf = (w: string, lang: Lang): number => NUMBERS[lang][w] ?? Number(w);

/* -------------------------------------------------------------------------- */
/* Index du lexique                                                           */
/* -------------------------------------------------------------------------- */

interface IndexedSynonym {
  readonly entry: LexiconEntry;
  readonly words: readonly string[];
  readonly text: string;
  readonly regional: boolean;
}

const stripArticles = (words: readonly string[], lang: Lang): string[] => words.filter((w) => !ARTICLES[lang].has(w));

/** Début de libellé (« Lait 2 % ») : ajouté comme synonyme seulement s'il est propre à un produit. */
const labelHead = (entry: LexiconEntry, lang: Lang): string => entry.label[lang].split(',')[0] ?? entry.label[lang];

const buildIndex = (lang: Lang): IndexedSynonym[] => {
  const out: IndexedSynonym[] = [];
  const headCount = new Map<string, number>();
  for (const entry of LEXICON) {
    const h = normPhrase(labelHead(entry, lang)).join(' ');
    headCount.set(h, (headCount.get(h) ?? 0) + 1);
  }
  for (const entry of LEXICON) {
    const head = labelHead(entry, lang);
    const unique = headCount.get(normPhrase(head).join(' ')) === 1;
    const plain = unique ? [...entry.synonyms[lang], head] : [...entry.synonyms[lang]];
    const regional = lang === 'fr' ? entry.qc : [];
    for (const [list, isRegional] of [[plain, false], [regional, true]] as const) {
      for (const s of list) {
        const words = stripArticles(normPhrase(s), lang);
        if (words.length === 0) continue;
        out.push({ entry, words, text: words.join(' '), regional: isRegional });
      }
    }
  }
  return out;
};

const INDEX: Readonly<Record<Lang, readonly IndexedSynonym[]>> = { fr: buildIndex('fr'), en: buildIndex('en') };

/** Textes exacts des synonymes, pour garder « a two-four » malgré ses mots-nombres. */
const EXACT: Readonly<Record<Lang, ReadonlySet<string>>> = {
  fr: new Set(INDEX.fr.map((x) => x.text)),
  en: new Set(INDEX.en.map((x) => x.text)),
};

/**
 * Mots de liaison qui font partie d'un nom de produit (« soupe poulet et nouilles »,
 * « pork and beans ») : ils ne coupent pas la phrase.
 */
const PROTECTED: Readonly<Record<Lang, readonly (readonly string[])[]>> = {
  fr: LEXICON.flatMap((e) => [...e.synonyms.fr, ...e.qc]).map(normPhrase).filter((w) => w.includes('et') || w.includes('pis')),
  en: LEXICON.flatMap((e) => e.synonyms.en).map(normPhrase).filter((w) => w.includes('and')),
};

/* -------------------------------------------------------------------------- */
/* Similarité                                                                 */
/* -------------------------------------------------------------------------- */

/** Similarité 0–1 fondée sur la distance d'édition (Levenshtein). */
export const similarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return 1 - (prev[n] ?? Math.max(m, n)) / Math.max(m, n);
};

const indexOfSeq = (hay: readonly string[], needle: readonly string[]): number => {
  outer: for (let i = 0; i + needle.length <= hay.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};

/**
 * Score d'un synonyme pour une phrase dite :
 * - identique : 1 ;
 * - synonyme contenu dans la phrase et qui en couvre presque tout (« lait 2pct bio ») :
 *   sûr. S'il n'en couvre qu'une partie (« lait au chocolat » ⊃ « chocolat », « jus de
 *   canneberge » ⊃ « jus »), la personne a demandé autre chose : 0,5, ce qui mène au
 *   produit libre plutôt qu'à un produit voisin inventé ;
 * - même nombre de mots : similarité d'orthographe mot à mot (erreurs de reconnaissance,
 *   « beur » → « beurre »), chaque mot devant ressembler à son vis-à-vis ;
 * - sinon : 0.
 */
const scoreSynonym = (phrase: readonly string[], syn: IndexedSynonym): number => {
  const text = phrase.join(' ');
  if (text === syn.text) return 1;
  if (indexOfSeq(phrase, syn.words) >= 0) {
    const coverage = syn.text.length / text.length;
    return coverage >= 0.75 ? 0.6 + 0.35 * coverage : 0.5;
  }
  if (phrase.length !== syn.words.length) return 0;
  let sum = 0;
  for (let i = 0; i < phrase.length; i += 1) {
    const s = similarity(phrase[i] ?? '', syn.words[i] ?? '');
    if (s < 0.5) return 0;
    sum += s;
  }
  return sum / phrase.length;
};

interface Ranked {
  readonly entry: LexiconEntry;
  readonly score: number;
}

const rank = (phrase: readonly string[], lang: Lang, regional: boolean): Ranked[] => {
  const best = new Map<string, Ranked>();
  for (const syn of INDEX[lang]) {
    if (syn.regional && !regional) continue;
    const score = scoreSynonym(phrase, syn);
    const prev = best.get(syn.entry.key);
    if (!prev || score > prev.score) best.set(syn.entry.key, { entry: syn.entry, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
};

/* -------------------------------------------------------------------------- */
/* Découpage en segments                                                      */
/* -------------------------------------------------------------------------- */

const startsWithSeq = (toks: readonly Tok[], i: number, seq: readonly string[]): boolean =>
  seq.every((w, j) => toks[i + j]?.norm === w);

/** Positions des mots de liaison qui appartiennent à un nom de produit. */
const protectedPositions = (toks: readonly Tok[], lang: Lang): Set<number> => {
  const out = new Set<number>();
  const words = toks.map((t) => t.norm);
  for (const seq of PROTECTED[lang]) {
    for (let i = 0; i + seq.length <= words.length; i += 1) {
      if (seq.every((w, j) => words[i + j] === w)) for (let j = 0; j < seq.length; j += 1) out.add(i + j);
    }
  }
  return out;
};

export const segment = (transcript: string, lang: Lang): Tok[][] => {
  const toks = mergeCompoundNumbers(tokenize(transcript), lang);
  const keep = protectedPositions(toks, lang);
  const segments: Tok[][] = [[]];
  const current = (): Tok[] => segments[segments.length - 1] ?? [];

  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!t) break;
    if (t.norm === BOUNDARY) {
      segments.push([]);
      i += 1;
      continue;
    }
    if (!keep.has(i)) {
      const drop = PHRASES_TO_DROP[lang].find((seq) => startsWithSeq(toks, i, seq));
      if (drop) {
        i += drop.length;
        continue;
      }
      const conn = CONNECTORS[lang].find((seq) => startsWithSeq(toks, i, seq));
      if (conn) {
        segments.push([]);
        i += conn.length;
        continue;
      }
      if (FILLERS[lang].has(t.norm)) {
        i += 1;
        continue;
      }
      // Auto-correction : « deux non trois yogourts » → « trois yogourts » ;
      // après le nom : « deux yogourts non trois » → « trois yogourts ».
      const next = toks[i + 1];
      if (CORRECTION[lang].has(t.norm) && next && isNumberTok(next.norm, lang)) {
        const seg = current();
        const last = seg[seg.length - 1];
        if (last && isNumberTok(last.norm, lang)) {
          seg.pop();
          i += 1;
          continue;
        }
        // « deux yogourts non trois », ou « deux yogourts, non trois » (segment précédent).
        const target = seg.length > 0 ? seg : [...segments].reverse().find((s) => s.length > 0);
        const after = toks[i + 2];
        const quantityOnly =
          !after || after.norm === BOUNDARY || CONNECTORS[lang].some((seq) => startsWithSeq(toks, i + 2, seq));
        if (target && quantityOnly) {
          const at = target.findIndex((x) => isNumberTok(x.norm, lang));
          if (at >= 0) target[at] = next;
          else target.unshift(next);
          i += 2;
          continue;
        }
        // « deux pommes non trois bananes » : le produit corrigé remplace le précédent.
        if (target) target.length = 0;
        i += 1;
        continue;
      }
    }
    current().push(t);
    i += 1;
  }

  // Un segment sans mot de produit (« deux », reste d'une auto-correction) est ignoré,
  // sauf s'il nomme exactement un produit (« a two-four »).
  const filler = (w: string): boolean => isNumberTok(w, lang) || CORRECTION[lang].has(w) || ARTICLES[lang].has(w);
  return segments.filter(
    (s) => s.some((t) => !filler(t.norm)) || EXACT[lang].has(stripArticles(s.map((t) => t.norm), lang).join(' ')),
  );
};

/* -------------------------------------------------------------------------- */
/* Lecture d'un segment                                                       */
/* -------------------------------------------------------------------------- */

interface Parsed {
  readonly spoken: string;
  /** Mots du produit précédés du contenant dit (« bag of milk »), normalisés, sans articles. */
  readonly wordsWithUnit: readonly string[] | null;
  readonly quantity: number;
  readonly unit: Unit | null;
  /** Mots du produit, normalisés et sans articles (pour le rapprochement). */
  readonly words: readonly string[];
  /** Mots du produit tels qu'ils ont été dits (pour un produit libre). */
  readonly label: string;
  /** « pinte » : 1 L ou 2 L selon les gens, au Québec. */
  readonly pinte: boolean;
}

export const parseSegment = (seg: readonly Tok[], lang: Lang): Parsed => {
  let i = 0;
  let quantity = 1;
  let unit: Unit | null = null;
  let pinte = false;

  // « a couple of » → 2
  if (lang === 'en' && seg[0]?.norm === 'a' && seg[1]?.norm === 'couple') {
    quantity = 2;
    i = seg[2]?.norm === 'of' ? 3 : 2;
  } else if (seg[0] && isNumberTok(seg[0].norm, lang)) {
    quantity = numberOf(seg[0].norm, lang);
    i = 1;
  } else if (seg[0] && HALF.has(seg[0].norm)) {
    // « half a kilo », « demi-litre »
    quantity = 0.5;
    i = seg[1]?.norm === 'a' ? 2 : 1;
  }
  // « un demi kilo », « une demi-douzaine »
  if (i > 0 && seg[i] && HALF.has(seg[i]?.norm ?? '')) {
    quantity *= 0.5;
    i += 1;
  }
  // Articles entre la quantité et l'unité : « une boîte », « a can of ».
  const u = seg[i];
  const unitStart = i;
  // « l » et « g » seuls ne sont des unités qu'après un nombre (« l'eau » n'est pas « 1 litre d'eau »).
  if (u && UNITS[lang][u.norm] && (i > 0 || u.norm.length > 1)) {
    unit = UNITS[lang][u.norm] ?? null;
    i += 1;
  } else if (lang === 'fr' && u && (u.norm === 'pinte' || u.norm === 'pintes')) {
    pinte = true;
    i += 1;
  }
  // Mots d'introduction du produit : « de », « d' », « of ».
  while (seg[i] && ARTICLES[lang].has(seg[i]?.norm ?? '')) i += 1;

  const rest = seg.slice(i);
  const words = stripArticles(
    rest.map((t) => t.norm),
    lang,
  );
  const label = joinOrig(rest);
  const withUnit = unit !== null ? stripArticles(seg.slice(unitStart).map((t) => t.norm), lang) : null;
  return {
    spoken: joinOrig(seg),
    wordsWithUnit: withUnit,
    // Fractions (« un demi kilo », « 0,5 kg », « une demi-douzaine ») pour les poids,
    // volumes et douzaines ; ailleurs, au moins 1 article entier.
    quantity:
      unit !== null && (SIZE_UNITS.has(unit) || unit === 'dozen')
        ? Math.min(MAX_ITEM_QUANTITY, Math.max(0.1, Math.round(quantity * 100) / 100))
        : Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.ceil(quantity))),
    unit,
    words,
    label,
    pinte,
  };
};

/* -------------------------------------------------------------------------- */
/* Construction des produits                                                  */
/* -------------------------------------------------------------------------- */

const capitalize = (s: string): string => (s === '' ? s : s.charAt(0).toLocaleUpperCase() + s.slice(1));

export const isSensitiveText = (words: readonly string[]): boolean => {
  const text = ` ${words.join(' ')} `;
  return SENSITIVE_WORDS.some((w) => text.includes(` ${w} `));
};

const slug = (words: readonly string[]): string => words.join('-').replace(/[^a-z0-9-]/g, '').slice(0, 60);

const toCandidate = (r: Ranked, i: number, lang: Lang): Candidate => ({
  rank: (i + 1) as 1 | 2 | 3,
  label: r.entry.label[lang],
  normalizedProduct: r.entry.key,
  score: Math.round(r.score * 100) / 100,
  category: r.entry.category,
  pictogram: r.entry.category,
  unit: r.entry.unit,
  packageSize: r.entry.packageSize,
  sensitive: r.entry.sensitive,
});

const asCandidates = (list: readonly Candidate[]): Candidates | null => {
  const [a, b, c] = list;
  if (!a) return null;
  return c && b ? [a, b, c] : b ? [a, b] : [a];
};

const joinOr = (parts: readonly string[], lang: Lang): string => {
  const or = lang === 'fr' ? 'ou' : 'or';
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${or} ${parts[parts.length - 1]}`;
};

const doubtPrompt = (spoken: readonly string[], lang: Lang, register: Register): string =>
  lang === 'en'
    ? `I'm not sure about one item. Did you mean ${joinOr(spoken, lang)}?`
    : register === 'tu'
      ? `Pour un produit, je ne suis pas sûre. Voulais-tu ${joinOr(spoken, lang)} ?`
      : `Pour un produit, je ne suis pas sûre. Vouliez-vous ${joinOr(spoken, lang)} ?`;

/** « Carottes, 2 lb » → « Carottes » ; « Bœuf haché mi-maigre, 454 g » → « Bœuf haché mi-maigre ». */
const withoutSize = (label: string): string => label.replace(/,\s*[\d.,]+\s*(g|kg|lb|mL|ml|L)$/u, '');

/** Unité et quantité d'un produit reconnu, selon ce qui a été dit. */
const unitFor = (entry: LexiconEntry, parsed: Parsed): { unit: Unit; quantity: number; packageSize: PackageSize | null } => {
  // « 12 œufs » : douze œufs à l'unité, pas douze douzaines.
  if (parsed.unit === null && entry.unit === 'dozen' && parsed.quantity > 2) {
    return { unit: 'unit', quantity: parsed.quantity, packageSize: null };
  }
  // « 2 livres de carottes » : le poids dit remplace le format habituel.
  if (parsed.unit !== null && SIZE_UNITS.has(parsed.unit)) {
    return { unit: parsed.unit, quantity: parsed.quantity, packageSize: null };
  }
  // Douzaine et caisse changent la quantité réelle : on les garde. Pour les autres contenants
  // (« une boîte de céréales »), le contenant habituel du produit est plus fiable pour Instacart.
  const keepSpoken = parsed.unit === 'dozen' || parsed.unit === 'case';
  // « 24 canettes de liqueur » : des canettes, pas 24 bouteilles de 2 L.
  if (parsed.unit === 'can' && entry.category === 'beverages' && entry.unit !== 'can') {
    return { unit: 'can', quantity: parsed.quantity, packageSize: null };
  }
  return {
    unit: keepSpoken && parsed.unit !== null ? parsed.unit : entry.unit,
    quantity: parsed.quantity,
    packageSize: entry.packageSize,
  };
};

export const interpretTranscript = (input: InterpretInput): InterpretOutput => {
  const lang = langOf(input.locale);
  const regional = lang === 'fr' && input.regionalDictionary;
  const register: Register = input.register ?? 'vous';
  const sttConfidence = input.sttConfidence ?? 0.9;
  const segs = segment(input.transcript, lang);
  const items: InterpretedItem[] = [];

  for (const seg of segs) {
    const parsed = parseSegment(seg, lang);
    if (parsed.words.length === 0 || parsed.words.join('').length < 2) continue;
    const base = {
      itemId: input.newItemId(),
      sourceUtteranceId: input.utteranceId,
      spokenText: parsed.spoken,
      upcs: [] as readonly string[],
    };

    /* « Une pinte de lait » : 1, 2 ou 4 litres ? */
    if (regional && parsed.pinte && parsed.words[0] === 'lait') {
      const milk = ['lait-2-1l', 'lait-2-2l', 'lait-2-4l']
        .map((k) => LEXICON.find((x) => x.key === k))
        .filter((x): x is LexiconEntry => x !== undefined)
        .map((entry, i): Ranked => ({ entry, score: [0.45, 0.4, 0.15][i] ?? 0 }));
      const candidates = asCandidates(milk.map((r, i) => toCandidate(r, i, lang)));
      if (candidates) {
        const pending: PendingOut = {
          ...base,
          status: 'pending_choice',
          productKey: null,
          productLabel: null,
          category: null,
          quantity: parsed.quantity,
          unit: 'carton',
          packageSize: null,
          confidence: 0.45,
          sensitive: false,
          disambiguation: {
            threshold: DOUBT_THRESHOLD,
            candidates,
            ttsPrompt: 'Une pinte de lait, c’est 1 litre, 2 litres ou 4 litres ?',
            resolution: { state: 'unresolved' },
          },
        };
        items.push(pending);
        continue;
      }
    }

    /* Format dit (« deux litres de lait ») : on cherche d'abord « lait 2 litres ». */
    let ranking = rank(parsed.words, lang, regional);
    let sizedAsProduct = false;
    // Contenant qui fait partie du nom (« a bag of milk », « une poche de patates »).
    if (parsed.wordsWithUnit) {
      const withUnit = rank(parsed.wordsWithUnit, lang, regional);
      if (withUnit[0]?.score === 1) ranking = withUnit;
    }
    if (parsed.unit !== null && SIZE_UNITS.has(parsed.unit)) {
      const sized = [...parsed.words, String(parsed.quantity), SIZE_WORD[lang][parsed.unit as SizeUnit]];
      const sizedRanking = rank(sized, lang, regional);
      const top = sizedRanking[0];
      if (top && top.score === 1) {
        ranking = sizedRanking;
        sizedAsProduct = true;
      }
    }

    const top = ranking[0];
    if (top && top.score >= DOUBT_THRESHOLD) {
      const shape = sizedAsProduct
        ? { unit: top.entry.unit, quantity: 1, packageSize: top.entry.packageSize }
        : unitFor(top.entry, parsed);
      const confirmed: ConfirmedOut = {
        ...base,
        status: 'confirmed',
        productKey: top.entry.key,
        // Format habituel retiré du libellé quand le format dit le remplace (« 2 livres de carottes »).
        productLabel:
          shape.packageSize === null && top.entry.packageSize !== null
            ? withoutSize(top.entry.label[lang])
            : top.entry.label[lang],
        category: top.entry.category,
        ...shape,
        confidence: Math.round(Math.min(1, top.score) * sttConfidence * 100) / 100,
        sensitive: top.entry.sensitive,
        disambiguation: null,
      };
      items.push(confirmed);
      continue;
    }

    // Un produit sensible n'est jamais « deviné » parmi des produits voisins.
    const sensitiveSaid = isSensitiveText(parsed.words);
    if (top && top.score >= FREE_TEXT_BELOW && !sensitiveSaid) {
      const candidates = asCandidates(
        ranking
          .filter((r) => r.score >= CANDIDATE_MIN)
          .slice(0, 3)
          .map((r, i) => toCandidate(r, i, lang)),
      );
      if (candidates) {
        const pending: PendingOut = {
          ...base,
          status: 'pending_choice',
          productKey: null,
          productLabel: null,
          category: null,
          quantity: parsed.quantity,
          unit: parsed.unit ?? 'unit',
          packageSize: null,
          confidence: Math.round(top.score * 100) / 100,
          sensitive: candidates.some((c) => c.sensitive),
          disambiguation: {
            threshold: DOUBT_THRESHOLD,
            candidates,
            ttsPrompt: doubtPrompt(
              candidates.map((c) => LEXICON.find((x) => x.key === c.normalizedProduct)?.spoken[lang] ?? c.label),
              lang,
              register,
            ),
            resolution: { state: 'unresolved' },
          },
        };
        items.push(pending);
        continue;
      }
    }

    /* Produit libre : gardé tel qu'il a été dit. */
    const category: Category = 'other';
    const free: ConfirmedOut = {
      ...base,
      status: 'confirmed',
      productKey: `free:${slug(parsed.words) || 'produit'}`,
      // Libellé borné (le serveur refuse plus de 120 caractères).
      productLabel: capitalize(parsed.label).slice(0, 100),
      category,
      quantity: parsed.quantity,
      unit: parsed.unit ?? 'unit',
      packageSize: null,
      confidence: Math.round(sttConfidence * 0.9 * 100) / 100,
      sensitive: sensitiveSaid,
      disambiguation: null,
    };
    items.push(free);
  }

  return {
    utterance: {
      utteranceId: input.utteranceId,
      locale: input.locale,
      rawTranscript: input.transcript,
      cleanTranscript: segs.map(joinOrig).join(', '),
      sttConfidence,
      capturedAt: input.capturedAt,
      fromOfflineQueue: input.fromOfflineQueue,
    },
    items,
  };
};

/** Terme de recherche Instacart d'un produit (lexique) ou son libellé (produit libre). */
export const searchTermFor = (productKey: string, productLabel: string): string => {
  const entry = LEXICON.find((x) => x.key === productKey);
  return entry ? entry.search : (productLabel.split(',')[0] ?? productLabel).toLocaleLowerCase();
};

/** Libellé d'un produit du lexique dans une langue donnée (null pour un produit libre). */
export const labelFor = (productKey: string, locale: Locale): string | null =>
  LEXICON.find((x) => x.key === productKey)?.label[langOf(locale)] ?? null;
