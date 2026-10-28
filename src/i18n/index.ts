/**
 * Choix des textes selon la langue réglée par l'aidant (et la façon de parler en français).
 * Les écrans lisent les textes avec `useStrings()` ; la logique pure les reçoit en paramètre.
 */

import { createContext, useContext } from 'react';

import type { AppLocale, VoiceRegister } from '../types/vocourse';
import { en } from './en';
import { fr } from './fr';
import type { Strings } from './types';

export type { Strings } from './types';

const cache = new Map<string, Strings>();

export const stringsFor = (locale: AppLocale, register: VoiceRegister = 'vous'): Strings => {
  const key = `${locale}:${register}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = locale === 'en-CA' ? en() : fr(register);
  cache.set(key, s);
  return s;
};

export const StringsContext = createContext<Strings>(stringsFor('fr-CA'));

export const useStrings = (): Strings => useContext(StringsContext);
