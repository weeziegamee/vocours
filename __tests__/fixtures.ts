import type {
  ConfirmedItem,
  HandoffResponse,
  IsoDateTime,
  ItemId,
  ListId,
  PendingChoiceItem,
  ShoppingList,
  UserId,
} from '../src/types/vocourse';
import { interpretTranscript } from '../shared/nlp/interpret.ts';
import { createEmptyList, listReducer } from '../src/state/listReducer';

export const at = (s: string): IsoDateTime => s as IsoDateTime;

let seq = 0;

/** Produits tels que les renvoie l'analyseur (même code que le serveur). */
export const interpret = (transcript: string, locale: 'fr-CA' | 'en-CA' = 'fr-CA', regionalDictionary = true) =>
  interpretTranscript({
    utteranceId: `utt_${(seq += 1)}`,
    transcript,
    locale,
    capturedAt: '2026-10-28T14:00:00.000Z',
    fromOfflineQueue: false,
    regionalDictionary,
    newItemId: () => `itm_${(seq += 1)}`,
  }) as unknown as { utterance: ShoppingList['utterances'][number]; items: (ConfirmedItem | PendingChoiceItem)[] };

export const confirmedItems = (transcript: string): ConfirmedItem[] =>
  interpret(transcript).items.filter((i): i is ConfirmedItem => i.status === 'confirmed');

export const now = at('2026-10-28T14:00:00.000Z');

export const emptyList = (): ShoppingList => createEmptyList('lst_1' as ListId, 'usr_1' as UserId, now);

export const listWith = (transcript: string, list: ShoppingList = emptyList()): ShoppingList => {
  const r = interpret(transcript);
  return listReducer(list, { type: 'ADD_INTERPRETATION', utterance: r.utterance, items: r.items, now });
};

export const handoffOk: HandoffResponse = {
  handoffId: 'hnd_1' as HandoffResponse['handoffId'],
  status: 'sent_to_caregiver',
  caregiverNotified: true,
  smsStatus: 'sent',
  caregiverFirstName: 'Paul',
  receivedAt: at('2026-10-28T14:02:00Z'),
  linkExpiresAt: at('2026-10-30T14:02:00Z'),
};

export const itemId = (s: string): ItemId => s as ItemId;
