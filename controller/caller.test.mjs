import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jobOutputReferences, missingStepIds, unknownJobReferences, validateCaller } from './caller.mjs';

const HEALTHY = `name: IA DEV
on:
  workflow_dispatch:
jobs:
  prepare:
    steps:
      - name: IA DEV Prepare
        id: prepare
        uses: ./.github/actions/ia-dev-prepare
  verify:
    needs: [prepare]
    outputs:
      digest: \${{ steps.verify.outputs.digest }}
    steps:
      - name: IA DEV Verify
        id: verify
        uses: ./.github/actions/ia-dev-verify
`;

test('a caller whose step ids exist passes', () => {
  assert.deepEqual(validateCaller(HEALTHY), []);
});

test('a job output reading a step with no id is reported', () => {
  // The regression in TURNEO: the review job published
  // `${{ steps.review.outputs.approved }}` while the composite step carried no id, so
  // the output was empty and publication was skipped with every job green.
  const source = HEALTHY.replace(
    '      - name: IA DEV Verify\n        id: verify\n',
    '      - name: IA DEV Verify\n'
  );
  const problems = missingStepIds(source);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].job, 'verify');
  assert.equal(problems[0].step, 'verify');
  assert.match(problems[0].message, /no step in that job has "id: verify"/);
});

test('every job output reference is collected', () => {
  const source = HEALTHY.replace(
    '      digest: ${{ steps.verify.outputs.digest }}',
    '      digest: ${{ steps.verify.outputs.digest }}\n      approved: ${{ steps.verify.outputs.approved }}'
  );
  const references = jobOutputReferences(source);
  assert.deepEqual(references.map(r => r.output).sort(), ['approved', 'digest']);
});

test('a dependency on a job that does not exist is reported', () => {
  const source = HEALTHY.replace('needs: [prepare]', 'needs: [prepare, review]');
  assert.equal(unknownJobReferences(source).length, 1);
  assert.match(unknownJobReferences(source)[0].message, /needs "review", which is not a job/);
});

test('reading a job that does not exist is reported', () => {
  const source = HEALTHY.replace(
    '      digest: ${{ steps.verify.outputs.digest }}',
    '      digest: ${{ needs.ghost.outputs.digest }}'
  );
  const problems = unknownJobReferences(source);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /reads needs\.ghost/);
});

test('the report carries the line a caller can jump to', () => {
  const source = HEALTHY.replace('      - name: IA DEV Verify\n        id: verify\n', '      - name: IA DEV Verify\n');
  const { line } = missingStepIds(source)[0];
  assert.match(source.split('\n')[line - 1], /steps\.verify\.outputs\.digest/);
});

test('an expression that is not a step output is ignored', () => {
  const source = HEALTHY.replace('      digest: ${{ steps.verify.outputs.digest }}', '      digest: ${{ github.sha }}');
  assert.deepEqual(missingStepIds(source), []);
});