import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, chunk, sumCents } from '../src/main.mjs';
test('baseline clamp', () => assert.equal(clamp(2, 0, 5), 2));
test('baseline chunk', () => assert.deepEqual(chunk([1], 1), [[1]]));
test('chunk throws if not array', () => assert.throws(() => chunk(1, 1), TypeError));
test('chunk throws if size not positive integer', () => assert.throws(() => chunk([1], 0), RangeError));
test('chunk throws if size negative', () => assert.throws(() => chunk([1], -1), RangeError));
test('chunk returns empty for empty array', () => assert.deepEqual(chunk([], 2), []));
test('chunk splits into consecutive chunks', () => assert.deepEqual(chunk([1,2,3,4], 2), [[1,2],[3,4]]));
test('chunk handles remainder', () => assert.deepEqual(chunk([1,2,3], 2), [[1,2],[3]]));
test('baseline sum', () => assert.equal(sumCents([]), 0));

test('chunk rejects null values', () => assert.throws(() => chunk(null, 2), TypeError));
test('chunk rejects undefined values', () => assert.throws(() => chunk(undefined, 2), TypeError));
test('chunk rejects array-like objects', () => assert.throws(() => chunk({ length: 2, 0: 1, 1: 2 }, 1), TypeError));
test('chunk rejects string values', () => assert.throws(() => chunk('ab', 1), TypeError));
test('chunk rejects missing size', () => assert.throws(() => chunk([1, 2]), RangeError));

test('chunk rejects fractional size', () => assert.throws(() => chunk([1, 2], 1.5), RangeError));
test('chunk rejects NaN size', () => assert.throws(() => chunk([1, 2], NaN), RangeError));
test('chunk rejects Infinity size', () => assert.throws(() => chunk([1, 2], Infinity), RangeError));
test('chunk rejects non-numeric size', () => assert.throws(() => chunk([1, 2], '2'), RangeError));
test('chunk rejects unsafe integer size', () => assert.throws(() => chunk([1, 2], 2 ** 53), RangeError));
test('chunk accepts Number.MAX_SAFE_INTEGER size', () => assert.deepEqual(chunk([1, 2], Number.MAX_SAFE_INTEGER), [[1, 2]]));
test('chunk accepts size of one', () => assert.deepEqual(chunk([1, 2, 3], 1), [[1], [2], [3]]));
test('chunk returns one chunk when size exceeds length', () => assert.deepEqual(chunk([1, 2], 10), [[1, 2]]));
test('chunk keeps original order', () => assert.deepEqual(chunk([5, 4, 3, 2, 1], 3), [[5, 4, 3], [2, 1]]));
test('chunk does not mutate input', () => {
  const input = [1, 2, 3, 4, 5];
  const snapshot = [...input];
  chunk(input, 2);
  assert.deepEqual(input, snapshot);
});
test('chunk returns fresh arrays detached from input', () => {
  const item = { id: 1 };
  const input = [item];
  const parts = chunk(input, 1);
  assert.notEqual(parts[0], input);
  parts[0].push(2);
  assert.equal(input.length, 1);
  assert.equal(parts[0][0], item);
});
test('chunk flattens back to the original contents', () => {
  const input = Array.from({ length: 10 }, (_, i) => i);
  const flattened = chunk(input, 4).flat();
  assert.deepEqual(flattened, input);
  assert.equal(chunk(input, 4).length, 3);
  assert.ok(chunk(input, 4).every((part) => part.length <= 4));
});
test('chunk reports array error before size error', () => assert.throws(() => chunk(1, 0), TypeError));
