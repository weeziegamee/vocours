/**
 * Règles de robustesse du code PIN de l'aidant (V3.0 §6.1) : 6 chiffres, et refus
 * des codes devinables (répétitions, suites, motifs du pavé numérique).
 */

export const PIN_LENGTH = 6;

export type PinWeakness =
  | 'length' // pas exactement 6 chiffres
  | 'same_digit' // 000000, 777777
  | 'sequence' // 123456, 654321, 345678
  | 'repeated_block' // 121212, 123123
  | 'common'; // motifs connus du pavé : 147258, 159753, 112233…

const COMMON = new Set(['112233', '147258', '159753', '258456', '852456', '102030', '010203', '696969', '131313']);

export const isDigits = (pin: string): boolean => /^\d+$/.test(pin);

export const checkPinStrength = (pin: string): PinWeakness | null => {
  if (pin.length !== PIN_LENGTH || !isDigits(pin)) return 'length';
  const d = Array.from(pin, Number);
  if (d.every((x) => x === d[0])) return 'same_digit';
  const steps = d.slice(1).map((x, i) => x - (d[i] ?? 0));
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'sequence';
  if (pin.slice(0, 2).repeat(3) === pin || pin.slice(0, 3).repeat(2) === pin) return 'repeated_block';
  if (COMMON.has(pin)) return 'common';
  return null;
};
