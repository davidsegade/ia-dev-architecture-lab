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
export function chunk(values, size) {
  if (!Array.isArray(values)) {
    throw new TypeError('chunk expects an array');
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new RangeError('chunk requires a positive safe integer size');
  }
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
export function sumCents(values) { return 0; }