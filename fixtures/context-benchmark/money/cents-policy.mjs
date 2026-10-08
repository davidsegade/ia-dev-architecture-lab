import { assertSafeCents } from './safe-integer.mjs';

export function normalizeCents(value) {
  return assertSafeCents(value, 'money value');
}

export function validateCentValues(values) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  return values.map((value) => normalizeCents(value));
}
