import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSyntheticPreflight } from './preflight.mjs';

const SELF = { targetRepo: 'owner/engine', engineRepo: 'owner/engine' };

test('already-satisfied is available only to objective registered synthetic tasks', () => {
  let calls = 0;
  const verifyFn = () => { calls++; return { task: 'clamp', cases: 11, passed: true }; };
  const result = evaluateSyntheticPreflight({
    task: 'clamp', requestProfile: 'legacy-synthetic', verifyFn, root: '.', writePaths: [], ...SELF
  });
  assert.equal(result.alreadySatisfied, true);
  assert.equal(result.eligible, true);
  assert.equal(result.acceptance.cases, 11);
  assert.equal(calls, 1);
});

test('ranked synthetic uses the same objective no-op preflight', () => {
  const result = evaluateSyntheticPreflight({
    task: 'chunk', requestProfile: 'ranked-synthetic', verifyFn: () => ({ task: 'chunk', cases: 11, passed: true }), root: '.', writePaths: [], ...SELF
  });
  assert.equal(result.alreadySatisfied, true);
  assert.equal(result.eligible, true);
});

test('failing objective acceptance continues to the normal author path', () => {
  const result = evaluateSyntheticPreflight({
    task: 'sumCents', requestProfile: 'ranked-synthetic', verifyFn: () => { throw new Error('acceptance failed'); }, root: '.', writePaths: [], ...SELF
  });
  assert.equal(result.alreadySatisfied, false);
  assert.equal(result.eligible, true);
  assert.equal(result.acceptance, null);
});

test('free-form code-change can never be declared satisfied by generic tests', () => {
  let calls = 0;
  const result = evaluateSyntheticPreflight({
    task: 'goal', requestProfile: 'code-change', verifyFn: () => { calls++; return { passed: true }; }, root: '.', writePaths: [], ...SELF
  });
  assert.equal(result.alreadySatisfied, false);
  assert.equal(result.eligible, false);
  assert.equal(calls, 0);
});

test('registered non-engine tasks are not silently treated as already satisfied', () => {
  let calls = 0;
  const result = evaluateSyntheticPreflight({
    task: 'add-dummy-test', requestProfile: 'legacy-synthetic', verifyFn: () => { calls++; return { passed: true }; }, root: '.', writePaths: [], ...SELF
  });
  assert.equal(result.alreadySatisfied, false);
  assert.equal(result.eligible, false);
  assert.equal(calls, 0);
});

test('engine synthetic task names cannot activate preflight in another repository', () => {
  let calls = 0;
  const result = evaluateSyntheticPreflight({
    task: 'clamp', requestProfile: 'legacy-synthetic', verifyFn: () => { calls++; return { passed: true }; }, root: '.', writePaths: [],
    targetRepo: 'owner/product', engineRepo: 'owner/engine'
  });
  assert.equal(result.alreadySatisfied, false);
  assert.equal(result.eligible, false);
  assert.equal(calls, 0);
});
