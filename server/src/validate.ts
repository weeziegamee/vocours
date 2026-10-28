/**
 * Lecture stricte des corps de requête : tout champ inattendu, absent ou hors bornes
 * produit une erreur 422 qui nomme le champ (jamais sa valeur).
 */

export class Invalid extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

export type Obj = Readonly<Record<string, unknown>>;

export const obj = (v: unknown, path: string): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Invalid(path, 'objet attendu');
  return v as Obj;
};

interface StrOpts {
  readonly min?: number;
  readonly max?: number;
  readonly re?: RegExp;
}

export const str = (o: Obj, k: string, path: string, opts: StrOpts = {}): string => {
  const v = o[k];
  const f = `${path}.${k}`;
  if (typeof v !== 'string') throw new Invalid(f, 'texte attendu');
  const s = v.trim();
  if (s.length < (opts.min ?? 1)) throw new Invalid(f, 'trop court');
  if (s.length > (opts.max ?? 200)) throw new Invalid(f, 'trop long');
  if (opts.re && !opts.re.test(s)) throw new Invalid(f, 'format invalide');
  return s;
};

export const nullableStr = (o: Obj, k: string, path: string, opts: StrOpts = {}): string | null =>
  o[k] === null || o[k] === undefined ? null : str(o, k, path, opts);

export const num = (o: Obj, k: string, path: string, min: number, max: number): number => {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Invalid(`${path}.${k}`, 'nombre hors bornes');
  return v;
};

export const int = (o: Obj, k: string, path: string, min: number, max: number): number => {
  const v = num(o, k, path, min, max);
  if (!Number.isInteger(v)) throw new Invalid(`${path}.${k}`, 'entier attendu');
  return v;
};

export const bool = (o: Obj, k: string, path: string): boolean => {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Invalid(`${path}.${k}`, 'booléen attendu');
  return v;
};

export const oneOf = <T extends string>(o: Obj, k: string, path: string, values: readonly T[]): T => {
  const v = o[k];
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) throw new Invalid(`${path}.${k}`, 'valeur non permise');
  return v as T;
};

export const iso = (o: Obj, k: string, path: string): string => {
  const s = str(o, k, path, { max: 40 });
  if (Number.isNaN(Date.parse(s))) throw new Invalid(`${path}.${k}`, 'date invalide');
  return s;
};

export const arr = (o: Obj, k: string, path: string, min: number, max: number): readonly unknown[] => {
  const v = o[k];
  if (!Array.isArray(v)) throw new Invalid(`${path}.${k}`, 'liste attendue');
  if (v.length < min || v.length > max) throw new Invalid(`${path}.${k}`, 'nombre d’éléments hors bornes');
  return v;
};

/* -------------------------------------------------------------------------- */
/* Formats canadiens                                                          */
/* -------------------------------------------------------------------------- */

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;
export type Province = (typeof PROVINCES)[number];

const POSTAL_RE = /^([ABCEGHJ-NPRSTVXY])(\d)([ABCEGHJ-NPRSTV-Z]) ?(\d)([ABCEGHJ-NPRSTV-Z])(\d)$/;

/** Province d'un code postal, selon sa première lettre (Postes Canada) ; X0A–X0C : Nunavut. */
export const provinceOfPostalCode = (postal: string): Province | null => {
  const m = POSTAL_RE.exec(postal.toUpperCase());
  if (!m) return null;
  const first = m[1] ?? '';
  const fsa = postal.toUpperCase().replace(/\s/g, '').slice(0, 3);
  switch (first) {
    case 'A': return 'NL';
    case 'B': return 'NS';
    case 'C': return 'PE';
    case 'E': return 'NB';
    case 'G': case 'H': case 'J': return 'QC';
    case 'K': case 'L': case 'M': case 'N': case 'P': return 'ON';
    case 'R': return 'MB';
    case 'S': return 'SK';
    case 'T': return 'AB';
    case 'V': return 'BC';
    case 'X': return ['X0A', 'X0B', 'X0C'].includes(fsa) ? 'NU' : 'NT';
    case 'Y': return 'YT';
    default: return null;
  }
};

/** Mobile nord-américain au format E.164 (« +15145550123 »). */
export const E164_RE = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Indicatifs du plan de numérotation nord-américain hors Canada et États-Unis (Caraïbes,
 * territoires) et indicatifs non géographiques : refusés, cibles classiques de la fraude
 * aux textos. Même liste dans l'appli (src/services/caregiver/settings.ts).
 */
export const BLOCKED_AREA_CODES: ReadonlySet<string> = new Set([
  '242', '246', '264', '268', '284', '340', '345', '441', '473', '649', '658', '664', '670', '671', '684', '721',
  '758', '767', '784', '787', '809', '829', '849', '868', '869', '876', '939',
  '500', '521', '522', '523', '524', '525', '533', '544', '566', '577', '588', '600', '622', '700', '710', '800',
  '833', '844', '855', '866', '877', '888', '900',
]);

export const isAllowedMobile = (e164: string): boolean => E164_RE.test(e164) && !BLOCKED_AREA_CODES.has(e164.slice(2, 5));

/** « +15145550123 » → « •••-•••-0123 » (affichage sans révéler le numéro). */
export const maskMobile = (e164: string): string => `•••-•••-${e164.slice(-4)}`;
