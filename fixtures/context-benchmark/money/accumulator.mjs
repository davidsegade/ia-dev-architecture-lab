import { assertSafeCents } from './safe-integer.mjs';

export function safeAddCents(total, next) {
  assertSafeCents(total, 'running total');
  assertSafeCents(next, 'next value');
  const sum = total + next;
  if (!Number.isSafeInteger(sum)) throw new RangeError('cent total overflow');
  return sum;
}
