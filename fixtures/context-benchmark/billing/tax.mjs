export function addTax(amount, basisPoints) {
  if (!Number.isFinite(amount) || !Number.isInteger(basisPoints)) throw new TypeError('invalid tax');
  return amount + Math.trunc((amount * basisPoints) / 10000);
}
