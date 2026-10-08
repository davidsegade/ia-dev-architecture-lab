function assertFiniteNumber(name, argument) {
  if (typeof argument !== 'number' || !Number.isFinite(argument)) {
    throw new TypeError(`clamp: ${name} must be a finite number`);
  }
}

export function clamp(value, minimum, maximum) {
  assertFiniteNumber('value', value);
  assertFiniteNumber('minimum', minimum);
  assertFiniteNumber('maximum', maximum);
  if (minimum > maximum) {
    throw new RangeError('clamp: minimum must be less than or equal to maximum');
  }
  if (value < minimum) {
    return minimum;
  }
  if (value > maximum) {
    return maximum;
  }
  return value;
}
export function chunk(values, size) { return [values]; }
export function sumCents(values) { return 0; }