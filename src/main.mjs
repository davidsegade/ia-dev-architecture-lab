export function clamp(value, minimum, maximum) { return value; }
export function chunk(values, size) {
  if (!Array.isArray(values)) { throw new TypeError('chunk expects an array'); }
  if (!Number.isSafeInteger(size) || size <= 0) { throw new RangeError('chunk expects a positive safe integer size'); }
  const result = [];
  for (let index = 0; index < values.length; index += size) { result.push(values.slice(index, index + size)); }
  return result;
}
export function sumCents(values) { return 0; }
