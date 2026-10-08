import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRunMetrics, summarizeAgentResult } from './metrics.mjs';

const result = {
  model: 'opencode/example-free',
  modelCandidates: ['opencode/example-free', 'opencode/backup-free'],
  modelRegistryVerifiedAt: '2026-10-08',
  contextMode: 'ranked-context',
  sandbox: 7,
  attempts: [
    {
      context: { mode: 'ranked-context', selectedFileCount: 3, selectedSymbols: 8, chars: 900, preparationMs: 12, graphNodes: 30, graphEdges: 45, graphifyVersion: '0.9.80' },
      usage: { cost: 0, tokens: { input: 100, output: 20, reasoning: 3, cachedRead: 40, cachedWrite: 0 } }
    },
    {
      context: { mode: 'ranked-context', selectedFileCount: 4, selectedSymbols: 10, chars: 1000, preparationMs: 13, graphNodes: 32, graphEdges: 48, graphifyVersion: '0.9.80' },
      usage: { cost: 0, tokens: { input: 50, output: 10, reasoning: 2, cachedRead: 20, cachedWrite: 4 } }
    }
  ]
};

test('agent metrics aggregate model and ranked-context evidence', () => {
  assert.deepEqual(summarizeAgentResult(result), {
    model: 'opencode/example-free',
    candidates: 2,
    runs: 2,
    contextMode: 'ranked-context',
    contextFiles: 7,
    selectedFiles: 4,
    selectedSymbols: 10,
    contextChars: 1000,
    contextPreparationMs: 25,
    graphNodes: 32,
    graphEdges: 48,
    graphifyVersion: '0.9.80',
    cost: 0,
    tokens: { input: 150, output: 30, reasoning: 5, cachedRead: 60, cachedWrite: 4 },
    registryVerifiedAt: '2026-10-08'
  });
});

test('metrics format persists context efficiency without raw prompts or code', () => {
  const output = formatRunMetrics(result, { ...result, model: 'opencode/reviewer-free', sandbox: 6 });
  assert.match(output, /### IA DEV run metrics/);
  assert.match(output, /Author: model `opencode\/example-free`/);
  assert.match(output, /Reviewer: model `opencode\/reviewer-free`/);
  assert.match(output, /context ranked-context/);
  assert.match(output, /selected files 4/);
  assert.match(output, /selected symbols 10/);
  assert.match(output, /context chars 1000/);
  assert.match(output, /tokens input 150, output 30/);
  assert.match(output, /observed cost 0/);
  assert.match(output, /Free-model registry verified: 2026-10-08; Graphify: 0.9.80/);
  assert.doesNotMatch(output, /Specification:|prompt|source code/i);
});

test('missing telemetry produces bounded zero-valued legacy metrics', () => {
  const summary = summarizeAgentResult({ model: 'x', attempts: [{}], sandbox: 2 });
  assert.equal(summary.runs, 1);
  assert.equal(summary.contextMode, 'legacy');
  assert.equal(summary.contextFiles, 2);
  assert.equal(summary.selectedFiles, 2);
  assert.equal(summary.contextChars, 0);
  assert.equal(summary.cost, 0);
  assert.equal(summary.tokens.input, 0);
});
