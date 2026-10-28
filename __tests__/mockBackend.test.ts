import { createMockVocourseBackend, DEMO_CODE } from '../src/services/api/mockVocourseBackend';
import { itemsDigest, toHandoffItems } from '../src/services/handoff/digest';
import type { CaregiverSettings, ConfirmedItem, HandoffRequest, IdempotencyKey, IsoDateTime, ListId, NonEmptyArray, UtteranceId } from '../src/types/vocourse';
import { at } from './fixtures';

const settings: CaregiverSettings = {
  seniorFirstName: 'Jeanne',
  caregiverFirstName: 'Paul',
  caregiverMobile: '+15145550123' as CaregiverSettings['caregiverMobile'],
  smsConsent: true,
  address: { civicNumber: '1234', street: 'rue Saint-Denis', apartment: null, city: 'Montréal', province: 'QC', postalCode: 'H2T 1S6' as CaregiverSettings['address']['postalCode'] },
  preferredRetailer: { key: 'demo-maxi', name: 'Maxi' },
  language: 'fr-CA',
  register: 'vous',
  regionalDictionary: true,
  updatedAt: at('2026-10-28T14:00:00Z'),
};

const make = (scenario = {}) => createMockVocourseBackend({ scenario: { latencyMs: 0, ...scenario }, sleep: async () => undefined });

const k = (s: string) => s as IdempotencyKey;

const ready = async (scenario = {}) => {
  const b = make(scenario);
  await b.saveCaregiverSettings(settings, k('set-1'));
  await b.startVerification('mobile');
  await b.confirmVerification('mobile', DEMO_CODE);
  return b;
};

const handoff = async (b: ReturnType<typeof make>): Promise<HandoffRequest> => {
  const r = await b.interpretUtterance(
    { utteranceId: 'utt_1' as UtteranceId, transcript: 'du beurre et des œufs', locale: 'fr-CA', capturedAt: at('2026-10-28T14:00:00Z') as IsoDateTime, fromOfflineQueue: false, regionalDictionary: true, register: 'vous' },
    k('utt-1'),
  );
  if (!r.ok) throw new Error('analyse attendue');
  const items = r.value.items.filter((i): i is ConfirmedItem => i.status === 'confirmed') as unknown as NonEmptyArray<ConfirmedItem>;
  return {
    listId: 'lst_1' as ListId,
    tier: 'economy',
    items: toHandoffItems(items),
    itemsDigest: itemsDigest(items),
    locale: 'fr-CA',
    confirmation: {
      readbackStartedAt: at('2026-10-28T14:01:00Z'),
      readbackCompletedAt: at('2026-10-28T14:01:10Z'),
      readbackText: 'relecture',
      first: { method: 'tap', at: at('2026-10-28T14:01:12Z') },
      second: { method: 'long_press', durationMs: 2000, at: at('2026-10-28T14:01:15Z') },
      actor: 'senior',
    },
  };
};

describe('Serveur simulé (mode démonstration)', () => {
  it('analyse avec le même lexique que le serveur réel', async () => {
    const r = await make().interpretUtterance(
      { utteranceId: 'u' as UtteranceId, transcript: 'du pâté chinois', locale: 'fr-CA', capturedAt: at('x'), fromOfflineQueue: false, regionalDictionary: true, register: 'vous' },
      k('utt-x'),
    );
    expect(r.ok && r.value.items[0]?.status === 'confirmed' ? r.value.items[0].productLabel : null).toBe('Pâté chinois');
  });

  it('refuse la transmission tant que le cellulaire n’est pas confirmé', async () => {
    const b = make();
    await b.saveCaregiverSettings(settings, k('set-1'));
    const r = await b.submitHandoff(await handoff(b), k('h-1'));
    expect(r.ok ? null : r.error.code).toBe('caregiver_unverified');
  });

  it('transmet la liste confirmée, sans doublon pour la même clé', async () => {
    const b = await ready();
    const req = await handoff(b);
    const first = await b.submitHandoff(req, k('h-1'));
    const again = await b.submitHandoff(req, k('h-1'));
    expect(first.ok).toBe(true);
    expect(again).toEqual(first);
    expect(b.outbox.length).toBe(1);
    expect(b.outbox[0]?.sms).not.toMatch(/beurre|œufs/);
  });

  it('refuse une liste différente de celle relue', async () => {
    const b = await ready();
    const req = await handoff(b);
    const r = await b.submitHandoff({ ...req, itemsDigest: 'f'.repeat(64) }, k('h-2'));
    expect(r.ok ? null : r.error.code).toBe('digest_mismatch');
  });

  it('simule un premier échec serveur puis réussit à la nouvelle tentative', async () => {
    const b = await ready({ failFirstHandoff: 'server' });
    const req = await handoff(b);
    const first = await b.submitHandoff(req, k('h-3'));
    expect(first.ok ? null : first.error.kind).toBe('server');
    expect((await b.submitHandoff(req, k('h-3'))).ok).toBe(true);
  });

  it('signale un aidant injoignable', async () => {
    const b = await ready({ caregiverUnreachable: true });
    const r = await b.submitHandoff(await handoff(b), k('h-4'));
    expect(r.ok ? r.value.smsStatus : null).toBe('pending');
  });

  it('refuse un mauvais code de vérification', async () => {
    const b = make();
    await b.saveCaregiverSettings(settings, k('set-1'));
    const r = await b.confirmVerification('mobile', '000000');
    expect(r.ok ? null : r.error.code).toBe('invalid_code');
  });
});
