/**
 * Empreinte de la liste relue au senior. Le serveur la recalcule (server/src/crypto.ts,
 * même algorithme) et refuse toute liste différente de celle qui a été confirmée.
 */

import type { ConfirmedItem, HandoffItem, NonEmptyArray } from '../../types/vocourse';
import { sha256Hex } from '../security/crypto';

export const itemsDigest = (
  items: readonly { readonly itemId: string; readonly productKey: string; readonly quantity: number; readonly unit: string }[],
): string =>
  sha256Hex(
    items
      .map((i) => [i.itemId, i.productKey, String(i.quantity), i.unit].join('\u001f'))
      .sort()
      .join('\u001e'),
  );

export const toHandoffItems = (items: NonEmptyArray<ConfirmedItem>): NonEmptyArray<HandoffItem> => {
  const map = (i: ConfirmedItem): HandoffItem => ({
    itemId: i.itemId,
    productKey: i.productKey,
    productLabel: i.productLabel,
    quantity: i.quantity,
    unit: i.unit,
    packageSize: i.packageSize,
    sensitive: i.sensitive,
    category: i.category,
  });
  const [first, ...rest] = items;
  return [map(first), ...rest.map(map)];
};
