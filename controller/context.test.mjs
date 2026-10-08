import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRankedContext, ensureGraphifyToolchain, GRAPHIFY_VERSION } from './context.mjs';

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

test('locked Graphify toolchain is installed with no dependency resolution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ia-dev-graphify-tool-'));
  const directory = join(root, 'venv');
  const lockPath = join(root, 'requirements.lock');
  writeFileSync(lockPath, 'graphifyy==0.9.80\n');
  const calls = [];
  const run = async (binary, args, options) => {
    calls.push({ binary, args, options });
    if (args[0] === '-m' && args[1] === 'venv') {
      mkdirSync(join(directory, 'bin'), { recursive: true });
      writeFileSync(join(directory, 'bin', 'python'), '');
    } else if (args.includes('pip')) {
      writeFileSync(join(directory, 'bin', 'graphify'), '');
    }
    return { code: 0, timedOut: false };
  };
  const binary = await ensureGraphifyToolchain({ directory, lockPath, run, env: { PATH: '/bin' } });
  assert.equal(binary, join(directory, 'bin', 'graphify'));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ['-m', 'venv', directory]);
  assert.deepEqual(calls[1].args, [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--no-deps', '-r', lockPath
  ]);
  assert.equal(calls[1].options.timeout, 180000);
  assert.equal(existsSync(binary), true);
});

test('locked toolchain install failure fails closed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ia-dev-graphify-tool-fail-'));
  const lockPath = join(root, 'requirements.lock');
  writeFileSync(lockPath, 'graphifyy==0.9.80\n');
  await assert.rejects(
    () => ensureGraphifyToolchain({
      directory: join(root, 'venv'), lockPath,
      run: async () => ({ code: 1, timedOut: false })
    }),
    /venv creation failed/
  );
});

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
