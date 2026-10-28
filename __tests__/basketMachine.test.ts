import { basketReducer, initialBasketState, type BasketState } from '../src/screens/basketMachine';
import { itemsDigest } from '../src/services/handoff/digest';
import type { BackendError, IdempotencyKey, ListId } from '../src/types/vocourse';
import { at, confirmedItems, handoffOk } from './fixtures';

const key = 'key-1' as IdempotencyKey;
const listId = 'lst_1' as ListId;
const items = confirmedItems('deux cartons de lait 2 % pis une douzaine d’œufs');

const armed = (): BasketState => {
  let s = initialBasketState('balanced');
  s = basketReducer(s, { type: 'START_READBACK', startedAt: at('2026-10-28T14:01:00Z'), text: 'relecture', items });
  s = basketReducer(s, { type: 'READBACK_DONE', completedAt: at('2026-10-28T14:01:20Z') });
  return basketReducer(s, { type: 'FIRST_CONFIRM', confirmation: { method: 'tap', at: at('2026-10-28T14:01:25Z') } });
};

const confirm = (s: BasketState, list = items) =>
  basketReducer(s, {
    type: 'SECOND_CONFIRM',
    confirmation: { method: 'long_press', durationMs: 2050, at: at('2026-10-28T14:01:30Z') },
    listId,
    items: list,
    key,
    locale: 'fr-CA',
  });

describe('Automate de l’écran B', () => {
  it('suit le parcours complet jusqu’à l’envoi, avec l’empreinte de la liste relue', () => {
    const s = confirm(armed());
    expect(s.phase.name).toBe('sending');
    if (s.phase.name !== 'sending') return;
    const r = s.phase.request;
    expect(r.tier).toBe('balanced');
    expect(r.items.length).toBe(2);
    expect(r.itemsDigest).toBe(itemsDigest(items));
    expect(r.confirmation.readbackText).toBe('relecture');
    expect(r.confirmation.first.method).toBe('tap');
    expect(r.confirmation.second.method).toBe('long_press');
    expect(JSON.stringify(r)).not.toMatch(/prix|total|price/i);
    expect(basketReducer(s, { type: 'SUBMIT_OK', response: handoffOk }).phase.name).toBe('sent');
  });

  it('refuse toute confirmation avant la fin de la relecture', () => {
    let s = initialBasketState('balanced');
    s = basketReducer(s, { type: 'START_READBACK', startedAt: at('t0'), text: 'x', items });
    expect(basketReducer(s, { type: 'FIRST_CONFIRM', confirmation: { method: 'voice', at: at('t1') } })).toBe(s);
  });

  it('refuse la seconde confirmation sans la première', () => {
    let s = initialBasketState('balanced');
    s = basketReducer(s, { type: 'START_READBACK', startedAt: at('t0'), text: 'x', items });
    s = basketReducer(s, { type: 'READBACK_DONE', completedAt: at('t1') });
    expect(confirm(s)).toBe(s);
  });

  it('refuse d’envoyer une liste différente de celle relue', () => {
    const s = armed();
    const first = items[0];
    if (!first) throw new Error('produit attendu');
    expect(confirm(s, [{ ...first, quantity: 9 }, ...items.slice(1)])).toBe(s);
    expect(confirm(s, items.slice(0, 1))).toBe(s);
  });

  it('refuse une relecture sans produit', () => {
    const s = initialBasketState('balanced');
    expect(basketReducer(s, { type: 'START_READBACK', startedAt: at('t0'), text: 'x', items: [] })).toBe(s);
  });

  it('bloque le changement de gamme hors de l’état « choix »', () => {
    const s = armed();
    expect(basketReducer(s, { type: 'SELECT_TIER', tier: 'economy' })).toBe(s);
  });

  it('revient au choix si la relecture est arrêtée ou annulée', () => {
    let s = initialBasketState('balanced');
    s = basketReducer(s, { type: 'START_READBACK', startedAt: at('t0'), text: 'x', items });
    expect(basketReducer(s, { type: 'READBACK_INTERRUPTED' }).phase.name).toBe('choosing');
    expect(basketReducer(armed(), { type: 'CANCEL' }).phase.name).toBe('choosing');
  });

  it('réessaie une panne passagère avec la même requête et la même clé', () => {
    const sending = confirm(armed());
    const error: BackendError = { kind: 'server', status: 503, attempts: 3 };
    const retried = basketReducer(basketReducer(sending, { type: 'SUBMIT_FAILED', error }), { type: 'RETRY' });
    expect(retried.phase.name).toBe('sending');
    if (retried.phase.name !== 'sending' || sending.phase.name !== 'sending') return;
    expect(retried.phase.key).toBe(key);
    expect(retried.phase.request).toBe(sending.phase.request);
  });

  it('ne réessaie pas une demande refusée (aidant non confirmé, liste invalide)', () => {
    const sending = confirm(armed());
    const failed = basketReducer(sending, { type: 'SUBMIT_FAILED', error: { kind: 'conflict', status: 409, attempts: 1, code: 'caregiver_unverified' } });
    expect(basketReducer(failed, { type: 'RETRY' })).toBe(failed);
  });

  it('ne peut pas annuler pendant l’envoi', () => {
    const sending = confirm(armed());
    expect(basketReducer(sending, { type: 'CANCEL' })).toBe(sending);
  });
});
