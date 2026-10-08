export function isSafeCents(value) {
  return Number.isSafeInteger(value);
}

export function assertSafeCents(value, label = 'cents') {
  if (!isSafeCents(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}
