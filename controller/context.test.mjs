import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRankedContext, GRAPHIFY_VERSION } from './context.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ia-dev-context-'));
  const candidate = join(root, 'candidate');
  const directory = join(root, 'context');
  mkdirSync(candidate);
  writeFileSync(join(candidate, 'route.ts'), 'export function createRoute() {}\n');
  return { root, candidate, directory };
}

function graph() {
  return {
    graph: { schema_version: 1, graphify_version: GRAPHIFY_VERSION },
    nodes: [
      { id: 'route', label: 'createRoute', source_file: 'route.ts', node_kind: 'function' }
    ],
    links: []
  };
}

test('context extraction is local code-only and produces bounded ranked metadata', async () => {
  const { candidate, directory } = fixture();
  const calls = [];
  const run = async (binary, args, options) => {
    calls.push({ binary, args, options });
    mkdirSync(join(directory, 'graphify-out'), { recursive: true });
    writeFileSync(join(directory, 'graphify-out', 'graph.json'), JSON.stringify(graph()));
    return { code: 0, timedOut: false, stdout: '', stderr: '' };
  };
  let tick = 100;
  const result = await buildRankedContext({
    candidate, directory, specification: 'Fix createRoute', binary: '/tool/graphify', run,
    now: () => (tick += 5)
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].binary, '/tool/graphify');
  assert.deepEqual(calls[0].args, ['extract', '.', '--code-only', '--no-cluster', '--max-workers', '1', '--out', directory]);
  assert.equal(calls[0].options.cwd, candidate);
  assert.equal(calls[0].options.timeout, 60000);
  assert.match(result.text, /route\.ts/);
  assert.deepEqual(result.metadata.selectedFiles, ['route.ts']);
  assert.equal(result.metadata.graphifyVersion, GRAPHIFY_VERSION);
  assert.equal(result.metadata.schemaVersion, 1);
  assert.equal(result.metadata.preparationMs, 5);
});

test('Graphify process failure fails closed', async () => {
  const { candidate, directory } = fixture();
  await assert.rejects(
    () => buildRankedContext({ candidate, directory, specification: 'x', run: async () => ({ code: 1, timedOut: false }) }),
    /Graphify extraction failed/
  );
});

test('Graphify timeout fails closed', async () => {
  const { candidate, directory } = fixture();
  await assert.rejects(
    () => buildRankedContext({ candidate, directory, specification: 'x', run: async () => ({ code: null, timedOut: true }) }),
    /timed out/
  );
});

test('missing graph output fails closed', async () => {
  const { candidate, directory } = fixture();
  await assert.rejects(
    () => buildRankedContext({ candidate, directory, specification: 'x', run: async () => ({ code: 0, timedOut: false }) }),
    /graph\.json missing or invalid/
  );
});

test('ranker rejects Graphify version drift', async () => {
  const { candidate, directory } = fixture();
  const run = async () => {
    mkdirSync(join(directory, 'graphify-out'), { recursive: true });
    const bad = graph();
    bad.graph.graphify_version = '0.9.81';
    writeFileSync(join(directory, 'graphify-out', 'graph.json'), JSON.stringify(bad));
    return { code: 0, timedOut: false };
  };
  await assert.rejects(
    () => buildRankedContext({ candidate, directory, specification: 'x', run }),
    /Unexpected Graphify version/
  );
});
