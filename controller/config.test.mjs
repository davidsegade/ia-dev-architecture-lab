import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, policyFor, tasksForPolicy } from './config.mjs';

const POLICY = `repositories:
  acme/api:
    allowed_paths:
      - "src/**"
      - "tests/**"
    protected_paths:
      - ".github/**"
      - "package.json"
    tasks:
      - add-healthcheck: "Add a healthcheck endpoint."
      - bump-deps: "Bump dependencies."
    acceptance_command: "npm test"
    build_command: "npm run build"
    workspace_root: "."
  acme/legacy-app:
    allowed_paths:
      - "app/**"
    protected_paths:
      - ".github/**"
    tasks:
      - add-log-line: "Add a log line."
    acceptance_command: "make test"
    build_command: "make"
    workspace_root: "."
`;

function withPolicy(body) {
  const dir = mkdtempSync(join(tmpdir(), 'ia-dev-config-'));
  const file = join(dir, 'repositories.yml');
  writeFileSync(file, POLICY);
  process.env.CONFIG_PATH = file;
  try {
    return body();
  } finally {
    delete process.env.CONFIG_PATH;
  }
}

test('loads repositories whose names contain slashes, dots and dashes', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.deepEqual(Object.keys(repositories).sort(), ['acme/api', 'acme/legacy-app']);
});

test('parses sequence values into arrays', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.deepEqual(repositories['acme/api'].allowed_paths, ['src/**', 'tests/**']);
  assert.deepEqual(repositories['acme/api'].protected_paths, ['.github/**', 'package.json']);
  assert.deepEqual(repositories['acme/legacy-app'].allowed_paths, ['app/**']);
});

test('parses scalar values without surrounding quotes', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.equal(repositories['acme/api'].acceptance_command, 'npm test');
  assert.equal(repositories['acme/api'].build_command, 'npm run build');
  assert.equal(repositories['acme/api'].workspace_root, '.');
  assert.equal(repositories['acme/legacy-app'].acceptance_command, 'make test');
});

test('parses hyphenated task names as objects', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.deepEqual(repositories['acme/api'].tasks, [
    { 'add-healthcheck': 'Add a healthcheck endpoint.' },
    { 'bump-deps': 'Bump dependencies.' }
  ]);
});

test('task descriptions are addressable by task name', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.deepEqual(tasksForPolicy(repositories['acme/api']), {
    'add-healthcheck': 'Add a healthcheck endpoint.',
    'bump-deps': 'Bump dependencies.'
  });
});

test('tasksForPolicy returns an empty catalog when no tasks are registered', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.deepEqual(tasksForPolicy({ tasks: [] }), {});
  assert.deepEqual(tasksForPolicy({}), {});
});

test('a repository outside the allowlist is rejected', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.throws(() => policyFor('evil/other', repositories), /not in allowlist/);
  assert.equal(policyFor('acme/api', repositories).acceptance_command, 'npm test');
});

test('policy never leaks between repositories', () => {
  const repositories = withPolicy(() => loadConfig());
  assert.equal(repositories['acme/api'].allowed_paths.length, 2);
  assert.equal(repositories['acme/legacy-app'].allowed_paths.length, 1);
  assert.equal(repositories['acme/legacy-app'].build_command, 'make');
});