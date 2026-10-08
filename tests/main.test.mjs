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

test('chunk splits an array into consecutive groups of at most size', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2, 3], 1), [[1], [2], [3]]);
  assert.deepEqual(chunk([1, 2, 3, 4], 3), [[1, 2, 3], [4]]);
  assert.deepEqual(chunk(['a', 'b', 'c', 'd', 'e', 'f'], 3), [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]);
});

test('chunk returns a single group when size covers the whole array', () => {
  assert.deepEqual(chunk([1, 2, 3], 3), [[1, 2, 3]]);
  assert.deepEqual(chunk([1, 2, 3], 100), [[1, 2, 3]]);
  assert.deepEqual(chunk([7], 1), [[7]]);
});

test('chunk returns an empty array for an empty input', () => {
  assert.deepEqual(chunk([], 1), []);
  assert.deepEqual(chunk([], 5), []);
  assert.deepEqual(chunk([], 1000), []);
});

test('chunk preserves order and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5];
  const copy = [...input];
  const result = chunk(input, 2);
  assert.deepEqual(input, copy);
  assert.deepEqual(result.flat(), input);
  assert.notEqual(result[0], input);
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});

test('chunk throws TypeError when the input is not an array', () => {
  for (const bad of [null, undefined, '1,2,3', 42, true, false, {}, { length: 2 }, Symbol('x'), 1n, () => [1]]) {
    assert.throws(() => chunk(bad, 1), TypeError);
  }
});

test('chunk throws TypeError when the input is missing', () => {
  assert.throws(() => chunk(), TypeError);
});

test('chunk throws RangeError for invalid sizes', () => {
  for (const bad of [0, -1, -10, 1.5, 0.5, NaN, Infinity, -Infinity, '2', null, undefined, true, {}, [], Symbol('2'), 1n, () => 2]) {
    assert.throws(() => chunk([1, 2, 3], bad), RangeError);
  }
});

test('chunk rejects sizes that are not safe integers', () => {
  assert.throws(() => chunk([1], Number.MAX_SAFE_INTEGER + 2), RangeError);
  assert.throws(() => chunk([1], Number.NaN), RangeError);
});

test('chunk reports TypeError for a non-array before checking size', () => {
  assert.throws(() => chunk('nope', 0), TypeError);
  assert.throws(() => chunk(null, -1), TypeError);
});
