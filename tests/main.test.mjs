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

test('chunk splits into consecutive arrays of at most size elements', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2, 3], 3), [[1, 2, 3]]);
  assert.deepEqual(chunk([1, 2, 3], 5), [[1, 2, 3]]);
  assert.deepEqual(chunk([1, 2, 3, 4], 1), [[1], [2], [3], [4]]);
  assert.deepEqual(chunk(['a', 'b', 'c', 'd', 'e', 'f'], 4), [['a', 'b', 'c', 'd'], ['e', 'f']]);
});

test('chunk returns an empty array for empty input', () => {
  assert.deepEqual(chunk([], 1), []);
  assert.deepEqual(chunk([], 10), []);
});

test('chunk does not mutate the input array', () => {
  const input = [1, 2, 3, 4, 5];
  const copy = [...input];
  const out = chunk(input, 2);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  for (const part of out) assert.notEqual(part, input);
});

test('chunk preserves element identity for object references', () => {
  const a = { id: 1 };
  const b = { id: 2 };
  const out = chunk([a, b], 1);
  assert.equal(out[0][0], a);
  assert.equal(out[1][0], b);
});

test('chunk throws TypeError for non-array values', () => {
  for (const bad of ['12', null, undefined, true, {}, 3, Symbol('x'), 1n, () => 1, new Set([1])]) {
    assert.throws(() => chunk(bad, 1), TypeError);
  }
  assert.throws(() => chunk(), TypeError);
});

test('chunk throws RangeError for invalid sizes', () => {
  for (const bad of [0, -1, -10, 1.5, 0.5, NaN, Infinity, -Infinity, '2', null, undefined, true, {}, [], Symbol('2'), 2n, () => 2, 2 ** 53]) {
    assert.throws(() => chunk([1, 2, 3], bad), RangeError);
  }
  assert.throws(() => chunk([1, 2, 3]), RangeError);
});

test('chunk reports TypeError before RangeError', () => {
  assert.throws(() => chunk('nope', 0), TypeError);
  assert.throws(() => chunk(undefined, -1), TypeError);
});

test('chunk supports large sizes and safe integer boundaries', () => {
  const values = [1, 2, 3];
  assert.deepEqual(chunk(values, Number.MAX_SAFE_INTEGER), [[1, 2, 3]]);
  assert.deepEqual(chunk(values, 2 ** 53 - 1), [[1, 2, 3]]);
});
