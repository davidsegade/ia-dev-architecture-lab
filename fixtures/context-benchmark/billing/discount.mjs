export function applyDiscount(amount, basisPoints) {
  if (!Number.isFinite(amount) || !Number.isInteger(basisPoints)) throw new TypeError('invalid discount');
  return amount - Math.trunc((amount * basisPoints) / 10000);
}
