import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const contextSource = () => readFileSync(join(import.meta.dirname, 'context.mjs'), 'utf8');
const agentSource = () => readFileSync(join(import.meta.dirname, 'agent.mjs'), 'utf8');
const lockText = () => readFileSync(join(root, 'toolchain/graphify-requirements.lock'), 'utf8');

test('Graphify lock pins every package to one exact version', () => {
  const lines = lockText().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  assert.ok(lines.length > 1, 'Graphify lock should include transitive packages');
  assert.ok(lines.includes('graphifyy==0.9.80'));
  for (const line of lines) {
    assert.match(line, /^[A-Za-z0-9_.-]+==[^=\s]+$/, `not exactly pinned: ${line}`);
    assert.doesNotMatch(line, />=|~=|git\+|https?:\/\//);
  }
});

test('controller installs the committed lock without dependency resolution', () => {
  const source = contextSource();
  assert.match(source, /GRAPHIFY_LOCK/);
  assert.match(source, /'--no-deps', '-r', lockPath/);
  assert.match(source, /'--disable-pip-version-check'/);
  assert.match(source, /'--no-input'/);
});

test('Graphify extraction is code-only bounded and single-worker', () => {
  const source = contextSource();
  assert.match(source, /'extract', '\.', '--code-only', '--no-cluster', '--max-workers', '1'/);
  assert.match(source, /timeout: 60000/);
  assert.match(source, /Unexpected installed Graphify version/);
});

test('Graphify environment contains no GitHub or model credential variables', () => {
  const source = agentSource();
  const start = source.indexOf('const graphifyEnv = {');
  const end = source.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'graphifyEnv block missing');
  const block = source.slice(start, end + 3);
  assert.doesNotMatch(block, /GH_TOKEN|GITHUB_TOKEN|OPENAI|ANTHROPIC|API_KEY|AUTHORIZATION/i);
  assert.match(block, /GRAPHIFY_NO_BACKUP/);
  assert.match(block, /DO_NOT_TRACK/);
});

test('ranked context is enabled only by engine-owned profile context mode', () => {
  const source = agentSource();
  assert.match(source, /const contextMode = profile\.contextMode/);
  assert.match(source, /\['legacy', 'ranked-context'\]\.includes\(contextMode\)/);
  assert.match(source, /contextMode === 'ranked-context'/);
});

test('temporary Graphify bootstrap workflow is absent from final architecture', () => {
  assert.equal(existsSync(join(root, '.github/workflows/bootstrap-graphify-lock.yml')), false);
});
