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