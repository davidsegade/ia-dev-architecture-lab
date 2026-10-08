import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_ADAPTER_VERSION, rankGraph, validateGraph, RANKED_CONTEXT_CHAR_BUDGET } from './context-ranker.mjs';

function graph() {
  return {
    nodes: [
      { id: 'route', label: 'createRoutedGpx()', source_file: 'src/routes/create-route.ts', file_type: 'code' },
      { id: 'weather', label: 'analyzeRouteWeather()', source_file: 'src/routes/weather.ts', file_type: 'code' },
      { id: 'routeTest', label: 'createRoutedGpx test', source_file: 'tests/create-route.test.ts', file_type: 'code' },
      { id: 'auth', label: 'login()', source_file: 'src/auth/login.ts', file_type: 'code' },
      { id: 'misc', label: 'helper()', source_file: 'src/misc/helper.ts', file_type: 'code' }
    ],
    edges: [
      { source: 'route', target: 'weather', relation: 'calls' },
      { source: 'route', target: 'routeTest', relation: 'tested_by' },
      { source: 'auth', target: 'misc', relation: 'calls' }
    ],
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0
  };
}

test('ranker prioritizes implementation and regression files related to the specification', () => {
  const result = rankGraph(graph(), 'Fix createRoutedGpx route creation and add regression tests');
  const topTwo = result.selectedFiles.slice(0, 2);
  assert.ok(topTwo.includes('src/routes/create-route.ts'));
  assert.ok(topTwo.includes('tests/create-route.test.ts'));
  assert.ok(result.selectedFiles.indexOf('src/auth/login.ts') > result.selectedFiles.indexOf('src/routes/create-route.ts'));
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

test('published Graphify graph contract accepts nodes edges hyperedges and token counters', () => {
  const valid = validateGraph(graph());
  assert.equal(valid.nodes.length, 5);
  assert.equal(rankGraph(valid, 'route').schemaVersion, GRAPH_ADAPTER_VERSION);
});

test('missing edges array fails closed', () => {
  const bad = graph();
  delete bad.edges;
  assert.throws(() => validateGraph(bad), /edges array missing/);
});

test('malformed Graphify edges fail closed', () => {
  const bad = graph();
  bad.edges = [{ source: 'route' }];
  assert.throws(() => validateGraph(bad), /malformed edge/);
});

test('graphs without source-backed nodes fail closed', () => {
  const bad = graph();
  bad.nodes = [{ id: 'x', label: 'x' }];
  assert.throws(() => rankGraph(bad, 'x'), /no source-backed nodes/);
});

test('generic goals still select deterministic bounded coverage', () => {
  const first = rankGraph(graph(), 'improve behavior', { maxFiles: 2 });
  const second = rankGraph(graph(), 'improve behavior', { maxFiles: 2 });
  assert.equal(first.selectedFiles.length, 2);
  assert.deepEqual(first.selectedFiles, second.selectedFiles);
});
