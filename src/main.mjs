export function clamp(value, minimum, maximum) {
  if (typeof value !== 'number' || typeof minimum !== 'number' || typeof maximum !== 'number') {
    throw new TypeError('clamp expects finite numbers');
  }
  if (!Number.isFinite(value) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new TypeError('clamp expects finite numbers');
  }
  if (minimum > maximum) {
    throw new RangeError('clamp requires minimum <= maximum');
  }
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}
export function chunk(values, size) { return [values]; }
export function sumCents(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('sumCents expects an array');
  }
  let total = 0;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new TypeError('sumCents expects an array of safe integers');
    }
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('sumCents exceeded the safe integer range');
    }
  }
  return total;
}