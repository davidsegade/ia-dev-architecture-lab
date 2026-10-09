import { lineItemTotal } from './line-item.mjs';

export function orderTotal(items) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  return items.reduce((total, item) => total + lineItemTotal(item), 0);
}
