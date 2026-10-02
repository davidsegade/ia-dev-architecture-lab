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

/**
 * True when a step publishes step outputs.
 *
 * A step either appends to GITHUB_OUTPUT from its own script, or runs a controller
 * entry point that publishes through GITHUB_OUTPUT itself. Only github.mjs does the
 * latter: agent.mjs and gate.mjs report through the bundle, not through outputs, so a
 * step running one of those writes nothing a caller could read.
 */
function publishesOutputs(keys) {
  const body = keys.join('\n');
  return body.includes('GITHUB_OUTPUT') || /controller\/github\.mjs/.test(body);
}

test('every composite output resolves to a step that publishes it', () => {
  // The regression: the review composite declared `value: ${{ steps.verdict.outputs.approved }}`
  // while the id sat on the step running the agent, which publishes nothing. The output
  // resolved empty and publication was skipped with every job green.
  for (const file of compositeFiles()) {
    const source = readFileSync(file, 'utf8');
    const declared = [...source.matchAll(/^ {2}(\w[\w-]*):\n {4}description:.*\n {4}value: \$\{\{ steps\.([\w-]+)\.outputs\.(\w[\w-]*) \}\}/gm)];
    for (const [, name, stepId, outputName] of declared) {
      const step = stepsOf(source).find(candidate => new RegExp(`^ {6}id: ${stepId}$`, 'm').test(candidate.keys.join('\n')));
      assert.ok(step, `${file} output ${name} reads steps.${stepId}.outputs, but no step has id: ${stepId}`);
      assert.ok(
        publishesOutputs(step.keys),
        `${file} step "${step.header.trim()}" has id: ${stepId} but never publishes ${outputName}`
      );
    }
  }
});

test('every step that publishes outputs carries an id', () => {
  for (const file of compositeFiles()) {
    for (const step of stepsOf(readFileSync(file, 'utf8'))) {
      if (!publishesOutputs(step.keys)) continue;
      assert.ok(
        hasKey(step.keys, 'id'),
        `${file} step "${step.header.trim()}" publishes outputs without an id, so no caller can read them`
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