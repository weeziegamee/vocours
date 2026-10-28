/**
 * Instacart Developer Platform (IDP), API publique :
 *  - POST /idp/v1/products/products_link : page de liste d'épicerie partageable ;
 *  - GET  /idp/v1/retailers?postal_code=…&country_code=CA : enseignes proches.
 *
 * La clé API ne quitte jamais ce serveur. Le payload ne contient aucun nom, adresse ni
 * identifiant du senior (titre compris). Aucun prix n'est demandé ni affiché par Vocourse :
 * seuls ceux d'Instacart font foi.
 */

import { searchTermFor } from '../../../shared/nlp/interpret.ts';

export type Tier = 'economy' | 'balanced' | 'premium_organic';
export type Locale = 'fr-CA' | 'en-CA';

export interface HandoffLine {
  readonly itemId: string;
  readonly productKey: string;
  readonly productLabel: string;
  readonly quantity: number;
  readonly unit: string;
  readonly packageSize: { readonly value: number; readonly unit: 'g' | 'kg' | 'lb' | 'mL' | 'L' } | null;
  readonly sensitive: boolean;
  readonly category: string;
}

export interface Retailer {
  readonly key: string;
  readonly name: string;
  readonly logoUrl: string | null;
}

interface Measurement {
  readonly quantity: number;
  readonly unit: string;
}

export interface LineItem {
  readonly name: string;
  readonly display_text: string;
  readonly line_item_measurements: readonly Measurement[];
  readonly filters?: { readonly brand_filters?: readonly string[]; readonly health_filters?: readonly string[] };
}

export interface ProductLinkPayload {
  readonly title: string;
  readonly link_type: 'shopping_list';
  readonly expires_in: number;
  readonly instructions: readonly string[];
  readonly line_items: readonly LineItem[];
  readonly landing_page_configuration?: { readonly partner_linkback_url: string };
}

/* -------------------------------------------------------------------------- */
/* Gammes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Marque maison de l'enseigne préférée, pour la gamme Économique. Les filtres de marque
 * d'Instacart sont sensibles à la casse : plusieurs graphies sont fournies.
 * À VALIDER contre le catalogue Instacart de chaque enseigne avant la mise en service.
 */
const STORE_BRANDS: readonly { readonly match: RegExp; readonly brands: readonly string[] }[] = [
  {
    match: /loblaw|no ?frills|superstore|real canadian|maxi|provigo|zehrs|fortinos|independent|valu.?mart|dominion|extra foods|wholesale club/i,
    brands: ['no name', 'No Name', 'sans nom'],
  },
  { match: /metro|super ?c|food basics|adonis/i, brands: ['Selection', 'Sélection'] },
  { match: /sobeys|\biga\b|safeway|freshco|foodland|thrifty|farm boy|lawtons/i, brands: ['Compliments'] },
  { match: /walmart/i, brands: ['Great Value'] },
  { match: /costco/i, brands: ['Kirkland Signature'] },
  { match: /save.?on|pricesmart|buy.?low|nesters|urban fare/i, brands: ['Western Family'] },
  { match: /giant tiger|tigre g[ée]ant/i, brands: ['Giant Value'] },
];

export const storeBrandsFor = (retailerName: string | null): readonly string[] | null =>
  retailerName === null ? null : (STORE_BRANDS.find((s) => s.match.test(retailerName))?.brands ?? null);

/** Rayons alimentaires : seuls ceux-ci reçoivent le filtre BIO. */
const FOOD = new Set(['dairy', 'bakery', 'pantry', 'deli', 'meat', 'beverages', 'produce', 'frozen', 'snacks']);

const filtersFor = (line: HandoffLine, tier: Tier, retailerName: string | null): LineItem['filters'] | undefined => {
  // Jamais de filtre santé ou de marque déduit pour un produit sensible (avenant CA-3.3).
  if (line.sensitive) return undefined;
  if (tier === 'premium_organic') return FOOD.has(line.category) ? { health_filters: ['ORGANIC'] } : undefined;
  if (tier === 'economy') {
    const brands = storeBrandsFor(retailerName);
    return brands ? { brand_filters: brands } : undefined;
  }
  return undefined; // Équilibré : marques courantes, sans filtre.
};

/* -------------------------------------------------------------------------- */
/* Mesures                                                                    */
/* -------------------------------------------------------------------------- */

const UNIT_TO_IDP: Readonly<Record<string, string>> = {
  unit: 'each', carton: 'each', bottle: 'each', jar: 'each', box: 'each', dozen: 'each',
  bag: 'package', package: 'package', case: 'package',
  can: 'can', bunch: 'bunch', head: 'head',
  g: 'g', kg: 'kg', lb: 'lb', mL: 'ml', L: 'l',
};
const SIZE_TO_IDP: Readonly<Record<string, string>> = { g: 'g', kg: 'kg', lb: 'lb', mL: 'ml', L: 'l' };

/** Nombre d'articles, puis volume ou poids total : Instacart choisit la meilleure mesure. */
export const measurementsFor = (line: HandoffLine): Measurement[] => {
  const count = line.unit === 'dozen' ? line.quantity * 12 : line.quantity;
  const out: Measurement[] = [{ quantity: count, unit: UNIT_TO_IDP[line.unit] ?? 'each' }];
  if (line.packageSize) {
    const total = Math.round(line.quantity * line.packageSize.value * 1000) / 1000;
    out.push({ quantity: total, unit: SIZE_TO_IDP[line.packageSize.unit] ?? 'each' });
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Payload                                                                    */
/* -------------------------------------------------------------------------- */

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Date du jour à l'heure de l'Est (fuseau de la majorité des utilisateurs ; seulement pour le titre). */
const dayLabel = (now: Date, locale: Locale): string => {
  const d = new Date(now.getTime() - 5 * 3600_000);
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  return locale === 'fr-CA' ? `${day === 1 ? '1er' : day} ${MONTHS_FR[month]}` : `${MONTHS_EN[month]} ${day}`;
};

const quantityText = (line: HandoffLine, locale: Locale): string => {
  const q = Number.isInteger(line.quantity) ? String(line.quantity) : String(line.quantity).replace('.', locale === 'fr-CA' ? ',' : '.');
  return locale === 'fr-CA' ? `Qté : ${q}` : `Qty: ${q}`;
};

export interface BuildPayloadInput {
  readonly lines: readonly HandoffLine[];
  readonly tier: Tier;
  readonly locale: Locale;
  readonly preferredRetailerName: string | null;
  readonly linkbackUrl: string | null;
  readonly expiresInDays: number;
  readonly now: Date;
}

export const buildProductLinkPayload = (input: BuildPayloadInput): ProductLinkPayload | null => {
  if (input.lines.length === 0) return null;
  const fr = input.locale === 'fr-CA';
  const instructions: string[] = [
    fr ? 'Liste dictée par votre proche avec Vocourse.' : 'Shopping list dictated by your loved one with Vocourse.',
  ];
  if (input.preferredRetailerName) {
    instructions.push(fr ? `Épicerie préférée : ${input.preferredRetailerName}.` : `Preferred store: ${input.preferredRetailerName}.`);
  }
  if (input.tier === 'economy' && storeBrandsFor(input.preferredRetailerName)) {
    instructions.push(
      fr
        ? 'Gamme Économique : marque maison de cette épicerie, quand elle existe.'
        : 'Economy basket: this store’s own brand, when available.',
    );
  }
  return {
    title: fr ? `Épicerie du ${dayLabel(input.now, input.locale)}` : `Groceries — ${dayLabel(input.now, input.locale)}`,
    link_type: 'shopping_list',
    expires_in: input.expiresInDays,
    instructions,
    line_items: input.lines.map((line) => {
      const filters = filtersFor(line, input.tier, input.preferredRetailerName);
      return {
        name: searchTermFor(line.productKey, line.productLabel),
        display_text: `${line.productLabel} — ${quantityText(line, input.locale)}`,
        line_item_measurements: measurementsFor(line),
        ...(filters ? { filters } : {}),
      };
    }),
    ...(input.linkbackUrl ? { landing_page_configuration: { partner_linkback_url: input.linkbackUrl } } : {}),
  };
};

/* -------------------------------------------------------------------------- */
/* Client HTTP                                                                */
/* -------------------------------------------------------------------------- */

export type InstacartResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'unavailable' | 'rejected'; readonly status: number | null };

export interface InstacartClient {
  createShoppingList(payload: ProductLinkPayload): Promise<InstacartResult<string>>;
  nearbyRetailers(postalCode: string): Promise<InstacartResult<Retailer[]>>;
}

export interface InstacartClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (event: string, data: Record<string, unknown>) => void;
}

export const createInstacartClient = (o: InstacartClientOptions): InstacartClient => {
  const doFetch = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 10_000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => undefined);

  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<InstacartResult<unknown>> => {
    let last: InstacartResult<unknown> = { ok: false, reason: 'unavailable', status: null };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) await sleep(500 * 2 ** (attempt - 2));
      try {
        const res = await doFetch(`${o.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${o.apiKey}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return { ok: true, value: (await res.json()) as unknown };
        // Journal : route et statut seulement (l'adresse de requête contient le code postal).
        await res.text().catch(() => '');
        log('instacart_error', { route: path.split('?')[0], status: res.status });
        if (res.status >= 500 || res.status === 429) {
          last = { ok: false, reason: 'unavailable', status: res.status };
          continue;
        }
        return { ok: false, reason: 'rejected', status: res.status };
      } catch (e) {
        log('instacart_network', { route: path.split('?')[0], error: e instanceof Error ? e.name : 'unknown' });
        last = { ok: false, reason: 'unavailable', status: null };
      }
    }
    return last;
  };

  return {
    async createShoppingList(payload) {
      const r = await call('POST', '/idp/v1/products/products_link', payload);
      if (!r.ok) return r;
      const url = (r.value as { products_link_url?: unknown }).products_link_url;
      return typeof url === 'string' && url.startsWith('http')
        ? { ok: true, value: url }
        : { ok: false, reason: 'unavailable', status: 200 };
    },
    async nearbyRetailers(postalCode) {
      const q = `postal_code=${encodeURIComponent(postalCode.replace(/\s/g, ''))}&country_code=CA`;
      const r = await call('GET', `/idp/v1/retailers?${q}`);
      if (!r.ok) return r;
      const list = (r.value as { retailers?: unknown }).retailers;
      if (!Array.isArray(list)) return { ok: false, reason: 'unavailable', status: 200 };
      const retailers = list
        .map((x): Retailer | null => {
          const v = x as { retailer_key?: unknown; name?: unknown; retailer_logo_url?: unknown };
          return typeof v.retailer_key === 'string' && typeof v.name === 'string'
            ? { key: v.retailer_key, name: v.name, logoUrl: typeof v.retailer_logo_url === 'string' ? v.retailer_logo_url : null }
            : null;
        })
        .filter((x): x is Retailer => x !== null);
      return { ok: true, value: retailers };
    },
  };
};

/**
 * Client de développement, sans clé : lien factice en `.invalid` (jamais un vrai lien) et
 * enseignes d'exemple. Refusé en production par la configuration.
 */
export const createOfflineInstacartClient = (log: (event: string, data: Record<string, unknown>) => void): InstacartClient => {
  let n = 0;
  return {
    async createShoppingList(payload) {
      n += 1;
      log('instacart_dev_payload', { lines: payload.line_items.length, title: payload.title });
      return { ok: true, value: `https://example.invalid/instacart-dev/list-${n}` };
    },
    async nearbyRetailers() {
      return {
        ok: true,
        value: [
          { key: 'dev-maxi', name: 'Maxi', logoUrl: null },
          { key: 'dev-metro', name: 'Metro', logoUrl: null },
          { key: 'dev-iga', name: 'IGA', logoUrl: null },
          { key: 'dev-loblaws', name: 'Loblaws', logoUrl: null },
          { key: 'dev-walmart', name: 'Walmart', logoUrl: null },
          { key: 'dev-costco', name: 'Costco', logoUrl: null },
        ],
      };
    },
  };
};
