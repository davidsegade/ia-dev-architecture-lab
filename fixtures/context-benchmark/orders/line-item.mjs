export function lineItemTotal({ quantity, unitPrice }) {
  if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(unitPrice)) throw new TypeError('invalid line item');
  return quantity * unitPrice;
}
