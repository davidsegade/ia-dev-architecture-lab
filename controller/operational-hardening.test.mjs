import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const laboratory = () => readFileSync(join(root, '.github/workflows/laboratory.yml'), 'utf8');
const github = () => readFileSync(join(import.meta.dirname, 'github.mjs'), 'utf8');

test('laboratory authorizes issue execution only when ia-dev is explicitly labeled', () => {
  const source = laboratory();
  assert.match(source, /types: \[labeled\]/);
  assert.doesNotMatch(source, /types: \[opened/);
  assert.doesNotMatch(source, /github\.event\.action == 'opened'/);
  assert.match(source, /github\.event\.action == 'labeled'/);
  assert.match(source, /github\.event\.label\.name == 'ia-dev'/);
});

test('unrelated labels cannot retrigger an already labeled request', () => {
  const source = laboratory();
  assert.match(source, /contains\(github\.event\.issue\.labels\.\*\.name, 'ia-dev'\)/);
  assert.match(source, /github\.event\.action == 'labeled' && github\.event\.label\.name == 'ia-dev'/);
});

test('prepare failure and already-satisfied lifecycle use paginated history', () => {
  const source = github();
  assert.match(source, /apiAll\('pulls\?state=all'\)/);
  const comments = source.match(/apiAll\(`issues\/\$\{issueNumber\}\/comments`\)/g) || [];
  assert.equal(comments.length, 3, 'prepare, failure and already-satisfied must scan complete comment history');
  assert.doesNotMatch(source, /per_page=100/);
});

test('controller delegates GitHub transport policy to one bounded client', () => {
  const source = github();
  assert.match(source, /createGitHubApi\(\{ targetRepo, token \}\)/);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test('proposal body persists token and context metrics after artifacts expire', () => {
  const source = github();
  assert.match(source, /formatRunMetrics\(author, review\)/);
  assert.match(source, /\$\{metricsText\}/);
  assert.match(source, /metrics, branch, base/);
});
