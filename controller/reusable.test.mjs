import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync('.github/workflows/ia-dev-engine.yml', 'utf8');
const laboratory = readFileSync('.github/workflows/laboratory.yml', 'utf8');
const publisher = readFileSync('controller/github.mjs', 'utf8');
const agent = readFileSync('controller/agent.mjs', 'utf8');

test('reusable workflow is a workflow_call entrypoint', () => {
  assert.match(engine, /workflow_call:/);
  assert.match(engine, /caller-workflow:/);
});

test('reusable workflow checks out its own immutable workflow SHA', () => {
  assert.match(engine, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(engine, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.doesNotMatch(engine, /ref:\s*main\b/);
});

test('reusable workflow never force-pushes proposals', () => {
  assert.doesNotMatch(engine, /push[^\n]*--force/);
  assert.doesNotMatch(publisher, /\['push',\s*'--force'/);
  assert.match(publisher, /proposalBranch\(issueNumber, process\.env\.GITHUB_RUN_ID/);
});

test('publication remains PR-only with no automatic merge command', () => {
  assert.match(publisher, /pulls', 'POST'/);
  assert.match(publisher, /Human approval required\. No automatic merge/);
  assert.doesNotMatch(publisher, /pulls\/[^`'\"]+\/merge/);
});

test('author and reviewer remain distinct free OpenCode models', () => {
  assert.match(agent, /opencode\/mimo-v2\.6-flash-free/);
  assert.match(agent, /opencode\/space-bunny-free/);
  assert.match(publisher, /author\.model === review\.model/);
});

test('failure recovery is bounded and redispatches a clean workflow run', () => {
  assert.match(engine, /steps\.failure\.outputs\.retry == 'true'/);
  assert.match(engine, /controller\/github\.mjs retry/);
  assert.match(publisher, /actions\/workflows\/\$\{encodeURIComponent\(workflow\)\}\/dispatches/);
});

test('laboratory is only a guarded wrapper around the reusable engine', () => {
  assert.match(laboratory, /uses: \.\/\.github\/workflows\/ia-dev-engine\.yml/);
  assert.match(laboratory, /github\.actor == github\.repository_owner/);
  assert.match(laboratory, /github-actions\[bot\]/);
  assert.doesNotMatch(laboratory, /controller\/agent\.mjs/);
});
