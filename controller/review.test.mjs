import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewVerdict } from './review.mjs';

const CHANGED = ['test/widget_test.dart'];

function read(filePath) {
  return { type: 'tool_use', part: { tool: 'read', state: { status: 'completed', input: { filePath } } } };
}

function events(verdict, { reads = ['/candidate/test/widget_test.dart'], text } = {}) {
  const lines = [
    ...reads.map(filePath => read(filePath)),
    { type: 'text', part: { text: 'I will inspect the files.' } },
    { type: 'text', part: { text: text ?? JSON.stringify(verdict) } }
  ];
  return lines.map(event => JSON.stringify(event)).join('\n');
}

test('structured final verdict follows actual file inspection', () => {
  const verdict = reviewVerdict(events({ approved: true, findings: [] }), CHANGED);
  assert.equal(verdict.approved, true);
});

test('a confident approval without inspection is rejected', () => {
  assert.throws(
    () => reviewVerdict(events({ approved: true, findings: [] }, { reads: [] }), CHANGED),
    /Reviewer did not read test\/widget_test.dart/
  );
});

test('reading an unrelated file does not satisfy the check', () => {
  assert.throws(
    () => reviewVerdict(events({ approved: true, findings: [] }, { reads: ['/candidate/README.md'] }), CHANGED),
    /Reviewer did not read/
  );
});

test('every changed file must be read, not just one of them', () => {
  const required = ['lib/a.dart', 'test/widget_test.dart'];
  assert.throws(
    () => reviewVerdict(events({ approved: true, findings: [] }, { reads: ['/candidate/test/widget_test.dart'] }), required),
    /Reviewer did not read lib\/a.dart/
  );
});

test('the required files follow the repository under review', () => {
  const verdict = reviewVerdict(
    events({ approved: true, findings: [] }, { reads: ['/candidate/src/main.mjs', '/candidate/tests/main.test.mjs'] }),
    ['src/main.mjs', 'tests/main.test.mjs']
  );
  assert.equal(verdict.approved, true);
});

test('a read that did not complete does not count as inspection', () => {
  const pending = JSON.stringify({
    type: 'tool_use',
    part: { tool: 'read', state: { status: 'pending', input: { filePath: '/candidate/test/widget_test.dart' } } }
  });
  const raw = [pending, JSON.stringify({ type: 'text', part: { text: '{"approved":true,"findings":[]}' } })].join('\n');
  assert.throws(() => reviewVerdict(raw, CHANGED), /Reviewer did not read/);
});

test('negative, contradictory and invalid verdicts fail closed', () => {
  for (const verdict of [
    { approved: false, findings: ['bug'] },
    { approved: true, findings: ['bug'] },
    { approved: 'true', findings: [] }
  ]) {
    assert.throws(() => reviewVerdict(events(verdict), CHANGED));
  }
});

test('a verdict wrapped in a markdown fence is still read', () => {
  const fenced = '```json\n{"approved":true,"findings":[]}\n```';
  const verdict = reviewVerdict(events(null, { text: fenced }), CHANGED);
  assert.equal(verdict.approved, true);
});

test('prose after the verdict does not hide a rejection', () => {
  const raw = events(null, { text: 'Looks good.\n{"approved":true,"findings":[]}' });
  assert.throws(() => reviewVerdict(raw, CHANGED), /Invalid reviewer verdict/);
});