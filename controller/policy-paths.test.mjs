import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getContextPaths, getWritePaths, getSensitivePaths, inspectPatch } from './gate.mjs';
import { copySandbox } from './sync.mjs';
import { loadConfig, policyFor } from './config.mjs';

function withEnv(values, body) {
  const before = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return body();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('context scope may be broader than write scope without widening edits', () => {
  withEnv({
    CONTEXT_PATHS: JSON.stringify(['src/**', 'tests/**', 'package.json']),
    WRITE_PATHS: JSON.stringify(['src/feature.mjs']),
    ALLOWED_PATHS: JSON.stringify(['legacy/**']),
    SENSITIVE_PATHS: JSON.stringify(['.env', '.env.*'])
  }, () => {
    assert.deepEqual(getContextPaths(), ['src/**', 'tests/**', 'package.json']);
    assert.deepEqual(getWritePaths(), ['src/feature.mjs']);
    assert.deepEqual(getSensitivePaths(), ['.env', '.env.*']);
  });
});

test('IA DEV 2.0 ALLOWED_PATHS remains a write-scope compatibility fallback', () => {
  withEnv({ CONTEXT_PATHS: undefined, WRITE_PATHS: undefined, ALLOWED_PATHS: JSON.stringify(['lib/**']) }, () => {
    assert.deepEqual(getWritePaths(), ['lib/**']);
    assert.deepEqual(getContextPaths(), ['lib/**']);
  });
});

test('a context-only file cannot be published', () => {
  const patch = 'diff --git a/docs/context.md b/docs/context.md\nindex 1111111..2222222 100644\n--- a/docs/context.md\n+++ b/docs/context.md\n@@ -1 +1 @@\n-old\n+new\n';
  assert.throws(
    () => inspectPatch(patch, ['src/**'], ['.github/**']),
    /Unauthorized path: docs\/context\.md/
  );
});

test('sensitive files are removed before the context sandbox is built', () => {
  const root = mkdtempSync(join(tmpdir(), 'ia-dev-context-'));
  const candidate = mkdtempSync(join(tmpdir(), 'ia-dev-candidate-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'src', 'feature.mjs'), 'export const feature = true;\n');
  writeFileSync(join(root, 'docs', 'architecture.md'), '# context\n');
  writeFileSync(join(root, '.env'), 'SECRET=do-not-copy\n');

  const copied = copySandbox(
    root,
    candidate,
    ['src/**', 'docs/**', '.env'],
    ['.env', '.env.*']
  );

  assert.deepEqual(copied.sort(), ['docs/architecture.md', 'src/feature.mjs']);
  assert.equal(existsSync(join(candidate, '.env')), false);
  assert.equal(existsSync(join(candidate, 'src', 'feature.mjs')), true);
  assert.equal(existsSync(join(candidate, 'docs', 'architecture.md')), true);
});

test('real repository policy defines explicit context, write and sensitive scopes', () => {
  const previous = process.env.CONFIG_PATH;
  process.env.CONFIG_PATH = join(process.cwd(), 'config', 'repositories.yml');
  try {
    const lab = policyFor('davidsegade/ia-dev-architecture-lab', loadConfig());
    assert.deepEqual(lab.write_paths, ['src/main.mjs', 'tests/main.test.mjs']);
    assert.deepEqual(lab.context_paths, ['src/**', 'tests/**', 'package.json']);
    assert.deepEqual(lab.sensitive_paths, ['.env', '.env.*']);
    assert.ok(lab.context_paths.length >= lab.write_paths.length);
  } finally {
    if (previous === undefined) delete process.env.CONFIG_PATH;
    else process.env.CONFIG_PATH = previous;
  }
});
