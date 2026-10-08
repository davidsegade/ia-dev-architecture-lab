import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankGraph, validateGraph, RANKED_CONTEXT_CHAR_BUDGET } from './context-ranker.mjs';

function graph() {
  return {
    graph: { schema_version: 1, graphify_version: '0.9.80' },
    nodes: [
      { id: 'route', label: 'createRoutedGpx', source_file: 'src/routes/create-route.ts', node_kind: 'function' },
      { id: 'weather', label: 'analyzeRouteWeather', source_file: 'src/routes/weather.ts', node_kind: 'function' },
      { id: 'routeTest', label: 'createRoutedGpx test', source_file: 'tests/create-route.test.ts', node_kind: 'test' },
      { id: 'auth', label: 'login', source_file: 'src/auth/login.ts', node_kind: 'function' },
      { id: 'misc', label: 'helper', source_file: 'src/misc/helper.ts', node_kind: 'function' }
    ],
    links: [
      { source: 'route', target: 'weather', type: 'calls' },
      { source: 'route', target: 'routeTest', type: 'tested_by' },
      { source: 'auth', target: 'misc', type: 'calls' }
    ]
  };
}

test('ranker prioritizes symbols and tests related to the specification', () => {
  const result = rankGraph(graph(), 'Fix createRoutedGpx route creation and add regression tests');
  assert.equal(result.selectedFiles[0], 'src/routes/create-route.ts');
  assert.ok(result.selectedFiles.includes('tests/create-route.test.ts'));
  assert.ok(result.selectedFiles.indexOf('src/auth/login.ts') > result.selectedFiles.indexOf('tests/create-route.test.ts'));
});

test('neighbors of a strong match receive a deterministic relevance boost', () => {
  const result = rankGraph(graph(), 'Fix createRoutedGpx route behavior', { maxFiles: 3 });
  assert.ok(result.selectedFiles.includes('src/routes/weather.ts'));
});

test('ranking is byte-for-byte deterministic for the same graph and goal', () => {
  const first = rankGraph(graph(), 'Fix createRoutedGpx and tests');
  const second = rankGraph(graph(), 'Fix createRoutedGpx and tests');
  assert.deepEqual(first, second);
});

test('ranker obeys file and character budgets', () => {
  const result = rankGraph(graph(), 'route test', { maxFiles: 2, maxChars: 180 });
  assert.ok(result.selectedFiles.length <= 2);
  assert.ok(result.chars <= 180);
  assert.ok(result.chars <= RANKED_CONTEXT_CHAR_BUDGET);
});

test('unsupported graph schema fails closed', () => {
  const bad = graph();
  bad.graph.schema_version = 2;
  assert.throws(() => validateGraph(bad), /Unsupported Graphify schema/);
});

test('unexpected Graphify version fails closed', () => {
  const bad = graph();
  bad.graph.graphify_version = '9.9.9';
  assert.throws(() => rankGraph(bad, 'route'), /Unexpected Graphify version/);
});

test('graphs without source-backed nodes fail closed', () => {
  const bad = graph();
  bad.nodes = [{ id: 'x', label: 'x' }];
  assert.throws(() => rankGraph(bad, 'x'), /no source-backed nodes/);
});

test('generic goals still select deterministic bounded coverage', () => {
  const result = rankGraph(graph(), 'improve behavior', { maxFiles: 2 });
  assert.equal(result.selectedFiles.length, 2);
  assert.deepEqual(result.selectedFiles, [...result.selectedFiles].sort());
});
