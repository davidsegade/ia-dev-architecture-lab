export function windows(values, size) {
  if (!Array.isArray(values) || !Number.isSafeInteger(size) || size < 1) throw new TypeError('invalid window');
  return values.slice(0, Math.max(0, values.length - size + 1)).map((_, index) => values.slice(index, index + size));
}
