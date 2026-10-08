import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, chunk, sumCents } from '../src/main.mjs';
test('baseline clamp', () => assert.equal(clamp(2, 0, 5), 2));
test('baseline chunk', () => assert.deepEqual(chunk([1], 1), [[1]]));
test('baseline sum', () => assert.equal(sumCents([]), 0));

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(2, 0, 5), 2);
  assert.equal(clamp(0.5, 0, 5), 0.5);
  assert.equal(clamp(-3, -10, -1), -3);
  assert.equal(clamp(42, -7.5, 7.5), 7.5);
});

test('clamp raises values below the minimum', () => {
  assert.equal(clamp(-1, 0, 5), 0);
  assert.equal(clamp(-0.0001, 0, 5), 0);
  assert.equal(clamp(-99, -10, 10), -10);
});

test('clamp lowers values above the maximum', () => {
  assert.equal(clamp(9, 0, 5), 5);
  assert.equal(clamp(5.0001, 0, 5), 5);
  assert.equal(clamp(1234, -3, 3), 3);
});

test('clamp bounds are inclusive', () => {
  assert.equal(clamp(0, 0, 5), 0);
  assert.equal(clamp(5, 0, 5), 5);
  assert.equal(clamp(-1, -1, 1), -1);
  assert.equal(clamp(1, -1, 1), 1);
});

test('clamp allows a collapsed range where minimum equals maximum', () => {
  assert.equal(clamp(4, 7, 7), 7);
  assert.equal(clamp(7, 7, 7), 7);
  assert.equal(clamp(9, 7, 7), 7);
});

test('clamp handles decimal and signed bounds', () => {
  assert.equal(clamp(0.15, 0.1, 0.2), 0.15);
  assert.equal(clamp(0.05, 0.1, 0.2), 0.1);
  assert.equal(clamp(0.25, 0.1, 0.2), 0.2);
  assert.equal(clamp(-2.5, -1.5, 1.5), -1.5);
});

test('clamp throws TypeError for non-numeric arguments', () => {
  for (const bad of ['2', null, undefined, true, {}, [], [2], Symbol('2'), 2n, () => 2]) {
    assert.throws(() => clamp(bad, 0, 5), TypeError);
    assert.throws(() => clamp(2, bad, 5), TypeError);
    assert.throws(() => clamp(2, 0, bad), TypeError);
  }
});

test('clamp throws TypeError for arguments that are not finite numbers', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => clamp(bad, 0, 5), TypeError);
    assert.throws(() => clamp(2, bad, 5), TypeError);
    assert.throws(() => clamp(2, 0, bad), TypeError);
  }
});

test('clamp throws TypeError when arguments are missing', () => {
  assert.throws(() => clamp(), TypeError);
  assert.throws(() => clamp(2), TypeError);
  assert.throws(() => clamp(2, 0), TypeError);
});

test('clamp reports TypeError before RangeError', () => {
  assert.throws(() => clamp(1, Infinity, -Infinity), TypeError);
  assert.throws(() => clamp(NaN, 5, 0), TypeError);
});

test('clamp throws RangeError when minimum exceeds maximum', () => {
  assert.throws(() => clamp(1, 5, 0), RangeError);
  assert.throws(() => clamp(-2, -1, -3), RangeError);
  assert.throws(() => clamp(0.5, 0.2, 0.1), RangeError);
});

test('clamp does not coerce string arguments', () => {
  assert.throws(() => clamp('3', 0, 5), TypeError);
  assert.throws(() => clamp(0, '1', 5), TypeError);
  assert.throws(() => clamp(0, 0, '5'), TypeError);
});

test('clamp rejects boxed number objects', () => {
  assert.throws(() => clamp(Object(3), 0, 5), TypeError);
  assert.throws(() => clamp(3, Object(0), 5), TypeError);
  assert.throws(() => clamp(3, 0, Object(5)), TypeError);
});

test('clamp handles extreme finite magnitudes', () => {
  const big = Number.MAX_VALUE;
  assert.equal(clamp(big, 0, 5), 5);
  assert.equal(clamp(-big, 0, 5), 0);
  assert.equal(clamp(Number.MIN_VALUE, 0, 1), Number.MIN_VALUE);
  assert.equal(clamp(big, -big, big), big);
});

test('clamp error messages name the offending argument', () => {
  assert.throws(() => clamp('x', 0, 5), { name: 'TypeError', message: /value/ });
  assert.throws(() => clamp(0, NaN, 5), { name: 'TypeError', message: /minimum/ });
  assert.throws(() => clamp(0, 0, Infinity), { name: 'TypeError', message: /maximum/ });
  assert.throws(() => clamp(0, 3, 1), { name: 'RangeError', message: /minimum/ });
});
