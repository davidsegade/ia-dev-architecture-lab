import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { changedPaths, copyBack, matchesPath, withinAllowedPaths } from './sync.mjs';

const ALLOWED = ['lib/**', 'test/**'];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ia-dev-sync-'));
  const candidate = join(root, 'candidate');
  const target = join(root, 'target');
  mkdirSync(join(candidate, 'test'), { recursive: true });
  mkdirSync(join(target, 'test'), { recursive: true });
  writeFileSync(join(candidate, 'test', 'widget_test.dart'), 'added\n');
  writeFileSync(join(target, 'test', 'widget_test.dart'), 'original\n');
  return { root, candidate, target };
}

test('changedPaths reports added, modified and removed files', () => {
  const baseline = { 'lib/a.dart': 'AAA', 'test/gone.dart': 'GGG' };
  const after = { 'lib/a.dart': 'BBB', 'test/new.dart': 'NNN' };
  assert.deepEqual(changedPaths(baseline, after).sort(), [
    'lib/a.dart',
    'test/gone.dart',
    'test/new.dart'
  ]);
});

test('changedPaths is empty when nothing moved', () => {
  assert.deepEqual(changedPaths({ 'lib/a.dart': 'AAA' }, { 'lib/a.dart': 'AAA' }), []);
});

test('a policy glob covers every file below it', () => {
  assert.ok(matchesPath('test/widget_test.dart', 'test/**'));
  assert.ok(matchesPath('lib/deep/nested/file.dart', 'lib/**'));
  assert.ok(matchesPath('lib/a.dart', 'lib/*'));
});

test('a policy glob does not cover files outside it', () => {
  assert.equal(matchesPath('libx/a.dart', 'lib/**'), false);
  assert.equal(matchesPath('pubspec.yaml', 'lib/**'), false);
  assert.equal(matchesPath('test/widget_test.dart', '.github/**'), false);
});

test('a protected glob covers everything below it', () => {
  assert.ok(matchesPath('.github/workflows/ci.yml', '.github/**'));
  assert.ok(matchesPath('.github/pubspec.yaml', '.github/**'));
});

test('a single star does not cross a path separator', () => {
  assert.equal(matchesPath('lib/deep/a.dart', 'lib/*'), false);
});

test('a literal policy path matches only itself', () => {
  assert.ok(matchesPath('src/main.mjs', 'src/main.mjs'));
  assert.equal(matchesPath('src/other.mjs', 'src/main.mjs'), false);
});

test('withinAllowedPaths accepts allowlisted changes and rejects the rest', () => {
  assert.ok(withinAllowedPaths(['test/widget_test.dart'], ALLOWED));
  assert.ok(withinAllowedPaths([], ALLOWED));
  assert.equal(withinAllowedPaths(['pubspec.yaml'], ALLOWED), false);
  assert.equal(withinAllowedPaths(['test/widget_test.dart', 'pubspec.lock'], ALLOWED), false);
});

test('copyBack copies the concrete changed paths, not the policy globs', () => {
  // The regression: iterating the globs tried to stat `candidate/lib/**`, which is not
  // a path on disk, so a successful agent run failed after acceptance had passed.
  const { root, candidate, target } = sandbox();
  const copied = copyBack(candidate, target, '.', ['test/widget_test.dart']);
  assert.deepEqual(copied, ['test/widget_test.dart']);
  assert.equal(readFileSync(join(target, 'test', 'widget_test.dart'), 'utf8'), 'added\n');
});

test('copyBack creates parent directories for a new nested file', () => {
  const { root, candidate, target } = sandbox();
  mkdirSync(join(candidate, 'lib', 'deep'), { recursive: true });
  writeFileSync(join(candidate, 'lib', 'deep', 'a.dart'), 'new\n');
  const copied = copyBack(candidate, target, '.', ['lib/deep/a.dart']);
  assert.deepEqual(copied, ['lib/deep/a.dart']);
  assert.equal(readFileSync(join(target, 'lib', 'deep', 'a.dart'), 'utf8'), 'new\n');
});

test('copyBack skips a path the agent removed', () => {
  const { candidate, target } = sandbox();
  const copied = copyBack(candidate, target, '.', ['test/deleted.dart']);
  assert.deepEqual(copied, []);
});

test('copyBack skips a directory path', () => {
  const { candidate, target } = sandbox();
  assert.deepEqual(copyBack(candidate, target, '.', ['test']), []);
});

test('copyBack honours workspace_root when placing the file', () => {
  const { candidate, target } = sandbox();
  mkdirSync(join(target, 'packages', 'app'), { recursive: true });
  const copied = copyBack(candidate, target, 'packages/app', ['test/widget_test.dart']);
  assert.deepEqual(copied, ['test/widget_test.dart']);
  assert.equal(
    readFileSync(join(target, 'packages', 'app', 'test', 'widget_test.dart'), 'utf8'),
    'added\n'
  );
});

test('a traversing name cannot write above the workspace root', () => {
  const { candidate, target } = sandbox();
  mkdirSync(join(candidate, '..', 'escape'), { recursive: true });
  writeFileSync(join(target, '..', 'escaped.dart'), 'untouched\n');
  // join() normalises the traversal, so the write stays inside the target tree.
  assert.deepEqual(copyBack(candidate, target, 'packages/app', ['../escaped.dart']), []);
  assert.equal(readFileSync(join(target, '..', 'escaped.dart'), 'utf8'), 'untouched\n');
});