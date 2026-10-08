import { test } from 'node:test';
import assert from 'node:assert/strict';

import { requestFromIssue, specificationDigest, taskCatalog, taskFromIssue, tasks } from './tasks.mjs';

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

test('taskFromIssue explains that the marker must be alone on its line', () => {
  assert.throws(
    () => taskFromIssue('task: clamp but also some prose', ['clamp']),
    /must be alone on its own line/
  );
});

test('taskFromIssue rejects literal backslash-n escapes instead of guessing', () => {
  assert.throws(
    () => taskFromIssue('task: clamp\\n\\nAdd a test.', ['clamp']),
    /must be alone on its own line/
  );
});

test('taskFromIssue lists the known tasks when the marker is absent', () => {
  assert.throws(() => taskFromIssue('please add a test', ['clamp', 'chunk']), /Known tasks: clamp, chunk/);
});

test('taskFromIssue lists the known tasks when the task is not allowlisted', () => {
  assert.throws(() => taskFromIssue('task: nope', ['clamp']), /Known tasks: clamp/);
});

test('taskFromIssue still accepts a marker followed by more prose lines', () => {
  const body = 'Intro line.\n\ntask: clamp\n\nFollow up prose.';
  assert.equal(taskFromIssue(body, ['clamp']), 'clamp');
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

test('legacy requests remain registered-task based', () => {
  const request = requestFromIssue('task: clamp', {
    taskCatalog: { clamp: 'Known specification' },
    allowedProfiles: ['legacy-synthetic']
  });
  assert.deepEqual(request, {
    profile: 'legacy-synthetic',
    task: 'clamp',
    specification: 'Known specification'
  });
});

test('code-change accepts a bounded free-form goal without creating policy', () => {
  const request = requestFromIssue(
    'profile: code-change\ngoal: Fix route creation\nPreserve existing behavior and add tests.',
    { taskCatalog: {}, allowedProfiles: ['legacy-synthetic', 'code-change'] }
  );
  assert.equal(request.profile, 'code-change');
  assert.equal(request.task, 'goal');
  assert.equal(request.specification, 'Fix route creation\nPreserve existing behavior and add tests.');
});

test('a repository that does not allow code-change rejects it', () => {
  assert.throws(
    () => requestFromIssue('profile: code-change\ngoal: change code', {
      taskCatalog: {},
      allowedProfiles: ['legacy-synthetic']
    }),
    /not allowed/
  );
});

test('code-change requires a non-empty bounded goal', () => {
  assert.throws(
    () => requestFromIssue('profile: code-change\ngoal:', {
      taskCatalog: {}, allowedProfiles: ['code-change']
    }),
    /cannot be empty/
  );
  assert.throws(
    () => requestFromIssue(`profile: code-change\ngoal: ${'x'.repeat(4001)}`, {
      taskCatalog: {}, allowedProfiles: ['code-change']
    }),
    /exceeds 4000/
  );
});

test('multiple profile markers fail closed', () => {
  assert.throws(
    () => requestFromIssue('profile: code-change\nprofile: code-change\ngoal: x', {
      taskCatalog: {}, allowedProfiles: ['code-change']
    }),
    /Exactly one profile marker/
  );
});

test('specification digest is stable and changes with the goal', () => {
  assert.equal(specificationDigest('same'), specificationDigest('same'));
  assert.notEqual(specificationDigest('same'), specificationDigest('different'));
  assert.match(specificationDigest('same'), /^[a-f0-9]{64}$/);
});
