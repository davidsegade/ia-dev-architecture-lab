import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const REAL_CONFIG = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'config/repositories.yml'
);

function realPolicy() {
  process.env.CONFIG_PATH = REAL_CONFIG;
  try {
    return loadConfig();
  } finally {
    delete process.env.CONFIG_PATH;
  }
}

test('the architecture lab policy is allowlisted with its real paths and commands', () => {
  const lab = policyFor('davidsegade/ia-dev-architecture-lab', realPolicy());
  assert.deepEqual(lab.allowed_paths, ['src/main.mjs', 'tests/main.test.mjs']);
  assert.deepEqual(lab.protected_paths, [
    '.github/**',
    'controller/**',
    'acceptance/**',
    'config/**',
    'package.json'
  ]);
  assert.equal(lab.acceptance_command, 'npm test');
  assert.equal(lab.build_command, 'npm run build');
  assert.equal(lab.workspace_root, '.');
});

test('the architecture lab policy registers exactly the engine task keys', () => {
  const lab = policyFor('davidsegade/ia-dev-architecture-lab', realPolicy());
  assert.deepEqual(Object.keys(tasksForPolicy(lab)), ['clamp', 'chunk', 'sumCents']);
});

test('lab task descriptions match the engine catalog verbatim', async () => {
  const { tasks } = await import('./tasks.mjs');
  const lab = policyFor('davidsegade/ia-dev-architecture-lab', realPolicy());
  assert.deepEqual(tasksForPolicy(lab), tasks);
});

test('the existing TURNEO policy survives alongside the lab policy', () => {
  const repositories = realPolicy();
  assert.ok(repositories['davidsegade/TURNEO-Flutter'], 'TURNEO-Flutter must remain allowlisted');
  const turneo = repositories['davidsegade/TURNEO-Flutter'];
  assert.deepEqual(turneo.allowed_paths, ['lib/**', 'test/**']);
  assert.deepEqual(turneo.protected_paths, [
    '.github/**',
    'pubspec.yaml',
    'pubspec.lock',
    'analysis_options.yaml',
    '.metadata'
  ]);
  assert.deepEqual(tasksForPolicy(turneo), {
    'add-dummy-test':
      'Add a simple dummy test to test/widget_test.dart that always passes. Do not modify any production code. Preserve existing tests.'
  });
  assert.equal(turneo.acceptance_command, 'flutter test');
  assert.equal(turneo.build_command, 'flutter analyze && flutter test');
  assert.equal(turneo.workspace_root, '.');
});