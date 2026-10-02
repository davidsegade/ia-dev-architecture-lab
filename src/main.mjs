export function clamp(value, minimum, maximum) { return value; }
export function chunk(values, size) {
  if (!Array.isArray(values)) {
    throw new TypeError('values must be an array');
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new RangeError('size must be a positive safe integer');
  }
  if (values.length === 0) {
    return [];
  }
  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}
export function sumCents(values) { return 0; }
