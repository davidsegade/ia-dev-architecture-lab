import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const packageJson = () => JSON.parse(readFileSync(join(root, 'toolchain/package.json'), 'utf8'));
const lock = () => JSON.parse(readFileSync(join(root, 'toolchain/package-lock.json'), 'utf8'));
const engine = () => readFileSync(join(root, '.github/workflows/ia-dev-engine.yml'), 'utf8');

test('toolchain pins OpenCode to one exact version', () => {
  assert.deepEqual(packageJson().dependencies, { 'opencode-ai': '1.18.35' });
  const locked = lock();
  assert.equal(locked.lockfileVersion, 3);
  assert.equal(locked.packages['node_modules/opencode-ai'].version, '1.18.35');
  assert.match(locked.packages['node_modules/opencode-ai'].integrity, /^sha512-/);
});

test('every locked OpenCode platform package has exact version and integrity', () => {
  const packages = Object.entries(lock().packages)
    .filter(([name]) => name.startsWith('node_modules/opencode-'));
  assert.ok(packages.length > 1, 'platform packages were not locked');
  for (const [name, entry] of packages) {
    assert.equal(entry.version, '1.18.35', `${name} drifted from the toolchain version`);
    assert.match(entry.integrity || '', /^sha512-/, `${name} has no registry integrity`);
  }
});

test('author and reviewer install the committed toolchain with npm ci', () => {
  const source = engine();
  const installs = source.match(/name: Install locked OpenCode toolchain/g) || [];
  assert.equal(installs.length, 2);
  const directories = source.match(/working-directory: \.ia-dev-engine\/toolchain/g) || [];
  assert.equal(directories.length, 2);
  assert.doesNotMatch(source, /npm install --prefix .*opencode-ai/);
  assert.doesNotMatch(source, /RUNNER_TEMP\/opencode/);
  assert.match(source, /\.ia-dev-engine\/toolchain\/node_modules\/\.bin\/opencode/);
});

test('temporary lock bootstrap workflow is not part of the final architecture', () => {
  assert.equal(existsSync(join(root, '.github/workflows/bootstrap-toolchain-lock.yml')), false);
});
