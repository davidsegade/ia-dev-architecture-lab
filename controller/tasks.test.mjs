import { test } from 'node:test';
import assert from 'node:assert/strict';

import { taskCatalog, taskFromIssue, tasks } from './tasks.mjs';

test('built-in synthetic tasks are always available', () => {
  for (const name of ['clamp', 'chunk', 'sumCents']) {
    assert.ok(tasks[name], `missing built-in task ${name}`);
    assert.ok(taskCatalog()[name], `missing built-in task ${name} in catalog`);
  }
});

test('taskFromIssue rejects an issue without a task marker', () => {
  assert.throws(() => taskFromIssue('please do something'), /registered synthetic task is required/);
});

test('taskFromIssue rejects a task outside the allowlist', () => {
  assert.throws(() => taskFromIssue('task: rm-rf', ['clamp']), /Task rm-rf not in allowlist/);
});

test('taskFromIssue returns an allowlisted task from a multi-line issue body', () => {
  const body = '## Request\n\nSome context.\n\ntask: chunk\n\nMore context.';
  assert.equal(taskFromIssue(body, ['chunk']), 'chunk');
});

test('taskFromIssue ignores surrounding whitespace and extra text after the marker', () => {
  assert.equal(taskFromIssue('task: clamp   \ntrailing text'), 'clamp');
});

test('a target repository cannot invent tasks when no policy is loaded', () => {
  const previous = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = 'acme/not-allowlisted';
  try {
    assert.deepEqual(Object.keys(taskCatalog()).sort(), ['chunk', 'clamp', 'sumCents']);
    assert.throws(() => taskFromIssue('task: anything', Object.keys(taskCatalog())), /not in allowlist/);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previous;
  }
});