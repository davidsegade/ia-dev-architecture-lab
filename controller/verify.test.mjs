import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verify } from './gate.mjs';

/**
 * Builds a target checkout with the project files a real build needs, plus a candidate
 * sandbox holding only the allowlisted paths. The two are deliberately different: the
 * sandbox cannot stand in for a build.
 */
function project({ allowedPaths = ['lib/**'], acceptanceCommand, buildCommand } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ia-dev-verify-'));
  const candidate = mkdtempSync(join(tmpdir(), 'ia-dev-candidate-'));

  mkdirSync(join(root, 'lib'), { recursive: true });
  mkdirSync(join(candidate, 'lib'), { recursive: true });
  writeFileSync(join(root, 'lib', 'app.dart'), 'int answer() => 42;\n');
  writeFileSync(join(candidate, 'lib', 'app.dart'), 'int answer() => 42;\n');
  writeFileSync(join(root, 'build.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(root, 'test.sh'), '#!/bin/sh\necho "1 test passed"\n', { mode: 0o755 });

  return {
    root,
    candidate,
    acceptanceCommand: acceptanceCommand ?? './test.sh',
    buildCommand: buildCommand ?? './build.sh'
  };
}

test('acceptance runs the policy commands in the target checkout', () => {
  const { root, candidate, acceptanceCommand, buildCommand } = project();
  const result = verify(root, 'add-dummy-test', candidate, ['lib/**'], acceptanceCommand, buildCommand);
  assert.equal(result.passed, true);
  assert.equal(result.task, 'add-dummy-test');
  assert.match(result.acceptance, /1 test passed/);
});

test('acceptance runs the build command declared for the repository', () => {
  const { root, candidate } = project({
    buildCommand: 'sh -c "echo building > marker.txt && test -f lib/app.dart"',
    acceptanceCommand: 'true'
  });
  const result = verify(root, 'add-dummy-test', candidate, ['lib/**'], 'true', 'sh -c "echo built > marker.txt"');
  assert.equal(result.passed, true);
});

test('a failing acceptance command rejects the change', () => {
  const { root, candidate } = project();
  assert.throws(
    () => verify(root, 'add-dummy-test', candidate, ['lib/**'], 'exit 3', 'true'),
    /sh failed/
  );
});

test('a failing build command rejects the change', () => {
  const { root, candidate } = project();
  assert.throws(
    () => verify(root, 'add-dummy-test', candidate, ['lib/**'], 'true', 'exit 4'),
    /sh failed/
  );
});

test('the agent sandbox alone cannot satisfy acceptance', () => {
  // The candidate holds only lib/, so a build that needs the project manifest must fail.
  // If acceptance ever ran in the sandbox this test would pass, which is the regression.
  const { root, candidate } = project();
  assert.throws(
    () => verify(root, 'add-dummy-test', candidate, ['lib/**'], 'test -f pubspec.yaml', 'true'),
    /sh failed/
  );
});

test('a policy naming a file that does not exist is rejected', () => {
  const { root, candidate } = project();
  assert.throws(
    () => verify(root, 'add-dummy-test', candidate, ['lib/**', 'lib/missing.dart'], 'true', 'true'),
    /Regular file required: lib\/missing.dart/
  );
});

test('a symbolic link inside the sandbox is rejected', () => {
  const { root, candidate } = project();
  rmSync(join(candidate, 'lib', 'app.dart'));
  symlinkSync(join(root, 'lib', 'app.dart'), join(candidate, 'lib', 'app.dart'));
  assert.throws(
    () => verify(root, 'add-dummy-test', candidate, ['lib/**'], 'true', 'true'),
    /Regular file required: lib\/app.dart/
  );
});