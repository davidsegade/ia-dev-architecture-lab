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

test('sumCents returns the exact sum', () => {
  assert.equal(sumCents([1, 2, 3]), 6);
  assert.equal(sumCents([100]), 100);
  assert.equal(sumCents([-5, 5]), 0);
  assert.equal(sumCents([-3, -4]), -7);
  assert.equal(sumCents([25, -10, -15]), 0);
  assert.equal(sumCents([0, 0, 0]), 0);
});

test('sumCents allows negative and mixed sign values', () => {
  assert.equal(sumCents([-1, 2, -3, 4]), 2);
  assert.equal(sumCents([Number.MIN_SAFE_INTEGER]), Number.MIN_SAFE_INTEGER);
  assert.equal(sumCents([Number.MAX_SAFE_INTEGER]), Number.MAX_SAFE_INTEGER);
});

test('sumCents returns 0 for an empty array', () => {
  assert.equal(sumCents([]), 0);
});

test('sumCents preserves exactness at large safe magnitudes', () => {
  assert.equal(sumCents([Number.MAX_SAFE_INTEGER - 1, 1]), Number.MAX_SAFE_INTEGER);
  assert.equal(sumCents([Number.MIN_SAFE_INTEGER + 1, -1]), Number.MIN_SAFE_INTEGER);
  assert.equal(sumCents([1e15, 1e15, -1e15]), 1e15);
});

test('sumCents throws TypeError for non-array input', () => {
  for (const bad of [null, undefined, '1,2', 5, true, {}, { length: 1 }, Number.MAX_SAFE_INTEGER, () => [1], new Set([1]), 2n]) {
    assert.throws(() => sumCents(bad), TypeError);
  }
  assert.throws(() => sumCents(), TypeError);
});

test('sumCents throws TypeError for invalid elements', () => {
  const invalid = ['1', null, undefined, true, false, {}, [], [1], NaN, Infinity, -Infinity, 1.5, -0.5, 0.1, 2n, Symbol('1'), () => 1];
  for (const bad of invalid) {
    assert.throws(() => sumCents([bad]), TypeError);
    assert.throws(() => sumCents([1, bad]), TypeError);
    assert.throws(() => sumCents([bad, 1]), TypeError);
  }
});

test('sumCents throws TypeError for unsafe integer elements', () => {
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER + 2]), TypeError);
  assert.throws(() => sumCents([Number.MIN_SAFE_INTEGER - 2]), TypeError);
  assert.throws(() => sumCents([9007199254740993]), TypeError);
});

test('sumCents throws RangeError when an intermediate sum leaves the safe range', () => {
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]), RangeError);
  assert.throws(() => sumCents([Number.MIN_SAFE_INTEGER, -1]), RangeError);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER - 1, 3]), RangeError);
  assert.throws(() => sumCents([1, Number.MAX_SAFE_INTEGER, 1]), RangeError);
});

test('sumCents throws RangeError when only the intermediate sum overflows', () => {
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1, -1]), RangeError);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]), RangeError);
});

test('sumCents reports TypeError before RangeError for invalid elements', () => {
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1.5]), TypeError);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, NaN]), TypeError);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, '1']), TypeError);
});
