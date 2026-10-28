import { clampQuantity, listReducer, MAX_QUANTITY, retentionDate } from '../src/state/listReducer';
import { canValidateList } from '../src/types/vocourse';
import type { ListId, ShoppingList } from '../src/types/vocourse';
import { emptyList, listWith, now } from './fixtures';

const doubtOf = (l: ShoppingList) => {
  const d = l.items.find((i) => i.status === 'pending_choice');
  if (!d || d.status !== 'pending_choice') throw new Error('doute attendu');
  return d;
};

describe('Réducteur de la liste', () => {
  it('conserve la liste 12 mois au plus', () => {
    expect(retentionDate(now)).toBe('2027-10-28');
    expect(emptyList().retentionUntil).toBe('2027-10-28');
  });

  it('passe en « doute » puis « prête » après résolution, et débloque « C’est bon »', () => {
    let l = listWith('deux cartons de lait 2 % pis du beur');
    expect(l.status).toBe('needs_disambiguation');
    expect(canValidateList(l)).toBe(false);
    const doubt = doubtOf(l);
    l = listReducer(l, { type: 'RESOLVE_DOUBT', itemId: doubt.itemId, answer: { kind: 'candidate', rank: 1, method: 'voice' }, now });
    expect(l.status).toBe('ready');
    expect(canValidateList(l)).toBe(true);
    const resolved = l.items.find((i) => i.itemId === doubt.itemId);
    if (resolved?.status !== 'confirmed') throw new Error('produit confirmé attendu');
    expect(resolved.productKey).toBe('beurre');
    expect(resolved.unit).toBe('package');
    expect(resolved.packageSize).toEqual({ value: 454, unit: 'g' });
    expect(resolved.disambiguation?.resolution).toEqual({ state: 'resolved', selectedRank: 1, method: 'voice', resolvedAt: now });
  });

  it('« une pinte de lait » : le format choisi est repris', () => {
    let l = listWith('une pinte de lait');
    l = listReducer(l, { type: 'RESOLVE_DOUBT', itemId: doubtOf(l).itemId, answer: { kind: 'candidate', rank: 2, method: 'tap' }, now });
    const milk = l.items[0];
    if (milk?.status !== 'confirmed') throw new Error('lait attendu');
    expect(milk.productKey).toBe('lait-2-2l');
    expect(milk.packageSize).toEqual({ value: 2, unit: 'L' });
  });

  it('retire le produit si aucun candidat ne convient', () => {
    let l = listWith('du beur');
    l = listReducer(l, { type: 'RESOLVE_DOUBT', itemId: doubtOf(l).itemId, answer: { kind: 'none_matched' }, now });
    expect(l.items[0]?.status).toBe('removed');
    expect(l.status).toBe('draft');
  });

  it('borne les quantités', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(80)).toBe(MAX_QUANTITY);
    expect(clampQuantity(1.5)).toBe(1.5); // « + » sur un demi-kilo
    expect(clampQuantity(0.5)).toBe(1);
    let l = listWith('du café');
    const item = l.items[0];
    if (!item) throw new Error('produit attendu');
    l = listReducer(l, { type: 'SET_QUANTITY', itemId: item.itemId, quantity: 4, now });
    expect(l.items[0]?.quantity).toBe(4);
  });

  it('retire puis remet un produit, avec sa quantité', () => {
    let l = listWith('trois yogourts');
    const item = l.items[0];
    if (!item) throw new Error('produit attendu');
    l = listReducer(l, { type: 'REMOVE_ITEM', itemId: item.itemId, now });
    expect(l.status).toBe('draft');
    l = listReducer(l, { type: 'RESTORE_ITEM', itemId: item.itemId, now });
    expect(l.items[0]?.status).toBe('confirmed');
    expect(l.items[0]?.quantity).toBe(3);
  });

  it('verrouille la liste une fois transmise à l’aidant', () => {
    let l = listWith('du café');
    l = listReducer(l, { type: 'MARK_SENT', now });
    expect(l.status).toBe('sent_to_caregiver');
    expect(listWith('des bines', l).items.length).toBe(1);
  });

  it('repart d’une liste vide dans la langue demandée après « RESET »', () => {
    const l = listReducer(listWith('du café'), { type: 'RESET', listId: 'lst_2' as ListId, now, locale: 'en-CA' });
    expect(l.items).toEqual([]);
    expect(l.listId).toBe('lst_2');
    expect(l.locale).toBe('en-CA');
  });

  it('reprend la liste gardée au démarrage, sans écraser une liste déjà commencée', () => {
    const saved = listWith('du café');
    expect(listReducer(emptyList(), { type: 'HYDRATE', list: saved })).toBe(saved);
    const started = listWith('du thé');
    expect(listReducer(started, { type: 'HYDRATE', list: saved })).toBe(started);
  });
});
