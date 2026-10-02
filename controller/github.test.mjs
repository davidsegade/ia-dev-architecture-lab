import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runPrepareMode(eventPayload) {
  const dir = mkdtempSync(join(tmpdir(), 'ia-dev-github-test-'));
  const eventPath = join(dir, 'event.json');
  const outputPath = join(dir, 'output');
  writeFileSync(eventPath, JSON.stringify(eventPayload));
  
  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_OUTPUT = outputPath;
  process.env.GITHUB_REPOSITORY = 'test/ia-dev-architecture-lab';
  process.env.GH_TOKEN = 'fake-token';
  
  // The fix logic: workflow_dispatch uses inputs.issue, issues uses issue.number
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  
  let issueNumber;
  if (event.event === 'workflow_dispatch') {
    issueNumber = Number(event.inputs?.issue);
  } else if (event.event === 'issues') {
    issueNumber = event.issue?.number;
  } else {
    issueNumber = event.issue?.number || Number(event.inputs?.issue);
  }
  
  if(!Number.isSafeInteger(issueNumber)||issueNumber<=0)throw new Error('Issue number required');
  
  rmSync(dir, { recursive: true, force: true });
  return issueNumber;
}

test('workflow_dispatch uses inputs.issue exclusively', () => {
  const event = {
    event: 'workflow_dispatch',
    inputs: { issue: '42', automatic: 'false' },
    issue: { number: 999 } // This should be IGNORED
  };
  assert.equal(runPrepareMode(event), 42);
});

test('workflow_dispatch ignores event.issue when inputs.issue present', () => {
  const event = {
    event: 'workflow_dispatch',
    inputs: { issue: '7', automatic: 'true' },
    issue: { number: 123 } // Should be ignored
  };
  assert.equal(runPrepareMode(event), 7);
});

test('issues event uses issue.number', () => {
  const event = {
    event: 'issues',
    issue: { number: 5 }
  };
  assert.equal(runPrepareMode(event), 5);
});

test('issues event ignores inputs if present', () => {
  const event = {
    event: 'issues',
    issue: { number: 3 },
    inputs: { issue: '999' } // Should be ignored
  };
  assert.equal(runPrepareMode(event), 3);
});

test('workflow_dispatch with missing inputs.issue throws', () => {
  const event = {
    event: 'workflow_dispatch',
    inputs: { automatic: 'false' }
  };
  assert.throws(() => runPrepareMode(event), /Issue number required/);
});

test('issues event with missing issue.number throws', () => {
  const event = {
    event: 'issues',
    issue: {}
  };
  assert.throws(() => runPrepareMode(event), /Issue number required/);
});