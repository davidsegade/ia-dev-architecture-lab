export function clamp(value, minimum, maximum) {
  for (const [name, n] of [['value', value], ['minimum', minimum], ['maximum', maximum]]) {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError(`${name} must be a finite number`);
  }
  if (minimum > maximum) throw new RangeError('minimum must not be greater than maximum');
  return Math.min(Math.max(value, minimum), maximum);
}
export function chunk(values, size) { return [values]; }
export function sumCents(values) { return 0; }
