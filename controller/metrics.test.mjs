import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRunMetrics, summarizeAgentResult } from './metrics.mjs';

const result = {
  model: 'opencode/example-free',
  modelCandidates: ['opencode/example-free', 'opencode/backup-free'],
  modelRegistryVerifiedAt: '2026-10-08',
  sandbox: 7,
  attempts: [
    { usage: { cost: 0, tokens: { input: 100, output: 20, reasoning: 3, cachedRead: 40, cachedWrite: 0 } } },
    { usage: { cost: 0, tokens: { input: 50, output: 10, reasoning: 2, cachedRead: 20, cachedWrite: 4 } } }
  ]
};

test('agent metrics aggregate every observed model run', () => {
  assert.deepEqual(summarizeAgentResult(result), {
    model: 'opencode/example-free',
    candidates: 2,
    runs: 2,
    contextFiles: 7,
    cost: 0,
    tokens: { input: 150, output: 30, reasoning: 5, cachedRead: 60, cachedWrite: 4 },
    registryVerifiedAt: '2026-10-08'
  });
});

test('metrics format persists useful data without raw prompts or code', () => {
  const output = formatRunMetrics(result, { ...result, model: 'opencode/reviewer-free', sandbox: 6 });
  assert.match(output, /### IA DEV run metrics/);
  assert.match(output, /Author: model `opencode\/example-free`/);
  assert.match(output, /Reviewer: model `opencode\/reviewer-free`/);
  assert.match(output, /tokens input 150, output 30/);
  assert.match(output, /observed cost 0/);
  assert.match(output, /Free-model registry verified: 2026-10-08/);
  assert.doesNotMatch(output, /Specification:|prompt|source code/i);
});

test('missing telemetry produces bounded zero-valued metrics', () => {
  const summary = summarizeAgentResult({ model: 'x', attempts: [{}], sandbox: 2 });
  assert.equal(summary.runs, 1);
  assert.equal(summary.contextFiles, 2);
  assert.equal(summary.cost, 0);
  assert.equal(summary.tokens.input, 0);
});
