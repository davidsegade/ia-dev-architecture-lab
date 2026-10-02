import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const actionsDir = join(process.cwd(), '.github', 'actions');

function compositeFiles() {
  return readdirSync(actionsDir)
    .filter(name => name.startsWith('ia-dev-'))
    .map(name => join(actionsDir, name, 'action.yml'));
}

/**
 * Splits a composite action manifest into steps.
 * A step starts at "    - name:" (4 spaces) and ends before the next one.
 */
function stepsOf(source) {
  const lines = source.split('\n');
  const steps = [];
  let current = null;
  for (const line of lines) {
    if (/^ {4}- /.test(line)) {
      current = { header: line, keys: [] };
      steps.push(current);
      continue;
    }
    if (current) current.keys.push(line);
  }
  return steps;
}

function hasKey(keys, key) {
  return keys.some(line => new RegExp(`^ {6}${key}:`).test(line));
}

test('every composite action declares shell on each run step', () => {
  for (const file of compositeFiles()) {
    const steps = stepsOf(readFileSync(file, 'utf8'));
    assert.ok(steps.length > 0, `${file} has no steps`);
    for (const step of steps) {
      if (!hasKey(step.keys, 'run')) continue;
      assert.ok(
        hasKey(step.keys, 'shell'),
        `${file} step "${step.header.trim()}" has run: without shell:`
      );
    }
  }
});

/**
 * A controller invocation that never touches the target working tree.
 * `prepare` only reads the engine policy file and calls the GitHub API, so it does
 * not require the target repository to be checked out at all.
 */
const API_ONLY = /controller\/github\.mjs prepare/;

test('every controller invocation runs from the target repository root', () => {
  // The controller resolves the workspace from process.cwd(). The engine lives in
  // ia-dev/ and the target repository in target/, so the controller must run with
  // working-directory: target or it silently operates on the wrong tree.
  for (const file of compositeFiles()) {
    for (const step of stepsOf(readFileSync(file, 'utf8'))) {
      const body = step.keys.join('\n');
      if (!/node "\$IA_DEV_ENGINE"\/controller\//.test(body)) continue;
      assert.ok(
        hasKey(step.keys, 'env'),
        `${file} step "${step.header.trim()}" must declare IA_DEV_ENGINE in env`
      );
      assert.match(body, /IA_DEV_ENGINE:/, `${file} step "${step.header.trim()}" must set IA_DEV_ENGINE`);
      if (API_ONLY.test(body)) {
        assert.equal(
          hasKey(step.keys, 'working-directory'),
          false,
          `${file} step "${step.header.trim()}" is API-only and must not depend on a target checkout`
        );
        continue;
      }
      assert.match(
        body,
        /working-directory: target/,
        `${file} step "${step.header.trim()}" must run the controller with working-directory: target`
      );
    }
  }
});

test('every controller invocation resolves the engine through IA_DEV_ENGINE', () => {
  for (const file of compositeFiles()) {
    for (const step of stepsOf(readFileSync(file, 'utf8'))) {
      const body = step.keys.join('\n');
      assert.equal(
        /node ia-dev\/controller\//.test(body),
        false,
        `${file} step "${step.header.trim()}" hardcodes the engine path instead of using IA_DEV_ENGINE`
      );
    }
  }
});

test('no composite action declares shell twice in the same step', () => {
  for (const file of compositeFiles()) {
    for (const step of stepsOf(readFileSync(file, 'utf8'))) {
      const count = step.keys.filter(line => /^ {6}shell:/.test(line)).length;
      assert.ok(count <= 1, `${file} step "${step.header.trim()}" declares shell ${count} times`);
    }
  }
});

test('no composite action interpolates expressions directly into run scripts', () => {
  for (const file of compositeFiles()) {
    const steps = stepsOf(readFileSync(file, 'utf8'));
    for (const step of steps) {
      if (!hasKey(step.keys, 'run')) continue;
      const body = step.keys.join('\n');
      const offending = body.match(/run:.*\$\{\{/);
      assert.equal(
        offending,
        null,
        `${file} step "${step.header.trim()}" interpolates an expression into a run script: ${offending?.[0].trim()}`
      );
    }
  }
});

test('no composite action echoes step outputs directly into GITHUB_OUTPUT', () => {
  for (const file of compositeFiles()) {
    const steps = stepsOf(readFileSync(file, 'utf8'));
    for (const step of steps) {
      const body = step.keys.join('\n');
      assert.equal(
        /echo\s+"?\$\{\{/.test(body),
        false,
        `${file} step "${step.header.trim()}" echoes a raw expression into a shell command`
      );
    }
  }
});

test('composite actions that run acceptance or build commands set up Flutter', () => {
  const needsFlutter = ['ia-dev-execute', 'ia-dev-verify', 'ia-dev-review'];
  for (const file of compositeFiles()) {
    const name = file.split('/').at(-2);
    if (!needsFlutter.includes(name)) continue;
    assert.match(
      readFileSync(file, 'utf8'),
      /subosito\/flutter-action@v2/,
      `${file} runs flutter commands but does not install the Flutter SDK`
    );
  }
});