import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const workflow = () => readFileSync(join(root, '.github/workflows/ia-dev-engine.yml'), 'utf8');
const github = () => readFileSync(join(import.meta.dirname, 'github.mjs'), 'utf8');

test('objective preflight runs before any OpenCode installation or model discovery', () => {
  const source = workflow();
  const preflight = source.indexOf('Preflight objective synthetic acceptance');
  const install = source.indexOf('Install locked OpenCode toolchain');
  const discovery = source.indexOf('Discover runtime OpenCode models');
  const author = source.indexOf('Execute scoped author');
  assert.ok(preflight >= 0 && preflight < install && install < discovery && discovery < author);
  assert.match(source, /Install locked OpenCode toolchain\n\s+if: steps\.preflight\.outputs\.already-satisfied != 'true'/);
  assert.match(source, /Discover runtime OpenCode models\n\s+if: steps\.preflight\.outputs\.already-satisfied != 'true'/);
  assert.match(source, /Execute scoped author\n\s+if: steps\.preflight\.outputs\.already-satisfied != 'true'/);
});

test('already-satisfied path skips verification review publication and failure retry', () => {
  const source = workflow();
  assert.match(source, /already-satisfied: \$\{\{ steps\.preflight\.outputs\.already-satisfied \}\}/);
  assert.match(source, /complete-already-satisfied:/);
  assert.match(source, /needs\.execute\.outputs\.already-satisfied == 'true'/);
  assert.match(source, /verify:[\s\S]*?needs\.execute\.outputs\.already-satisfied != 'true'/);
  assert.match(source, /report-failure:[\s\S]*?needs\.execute\.outputs\.already-satisfied != 'true'/);
});

test('completion revalidates immutable request identity and base before closing the issue', () => {
  const source = github();
  assert.match(source, /Request changed after preflight/);
  assert.match(source, /Base changed after preflight/);
  assert.match(source, /profile\.kind !== 'registered-task'/);
  assert.match(source, /!isEngineSelfTask\(reviewed\.task\)/);
  assert.match(source, /state: 'closed', state_reason: 'completed'/);
});

test('already-satisfied marker is digest-bound and participates in idempotency', () => {
  const source = github();
  assert.match(source, /ia-dev:already-satisfied:\$\{requestDigest\}/);
  assert.match(source, /Math\.max\(proposals\.length, readyMarkers\.length, satisfiedMarkers\.length\)/);
  assert.match(source, /request-digest/);
});

test('production preflight is restricted to the engine repository itself', () => {
  const source = workflow();
  assert.match(source, /IA_DEV_ENGINE_REPOSITORY: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(source, /TARGET_REPO: \$\{\{ github\.repository \}\}/);
});
