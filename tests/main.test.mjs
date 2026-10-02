import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, chunk, sumCents } from '../src/main.mjs';
test('baseline clamp', () => assert.equal(clamp(2, 0, 5), 2));
test('baseline chunk', () => assert.deepEqual(chunk([1], 1), [[1]]));
test('baseline sum', () => assert.equal(sumCents([]), 0));

test('chunk splits into consecutive groups of at most size', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assert.deepEqual(chunk([1, 2, 3], 10), [[1, 2, 3]]);
  assert.deepEqual(chunk([1, 2, 3], 1), [[1], [2], [3]]);
});
test('chunk returns an empty array for empty input', () => {
  assert.deepEqual(chunk([], 3), []);
});
test('chunk throws TypeError for a non-array', () => {
  for (const invalid of ['abc', 5, null, undefined, { length: 2 }, new Set([1])]) {
    assert.throws(() => chunk(invalid, 2), TypeError);
  }
});
test('chunk throws RangeError for a size that is not a positive safe integer', () => {
  for (const invalid of [0, -1, 1.5, NaN, Infinity, -Infinity, '2', null, undefined]) {
    assert.throws(() => chunk([1, 2], invalid), RangeError);
  }
});
test('chunk rejects a non-array before validating size', () => {
  assert.throws(() => chunk('abc', 0), TypeError);
});
test('chunk does not mutate the input and returns new arrays', () => {
  const input = [1, 2, 3];
  const snapshot = [...input];
  const result = chunk(input, 2);
  assert.deepEqual(input, snapshot);
  assert.notEqual(result[0], input);
  result[0].push(99);
  assert.deepEqual(input, [1, 2, 3]);
});
