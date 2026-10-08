import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { boundedProcess } from './process.mjs';
import { rankGraph } from './context-ranker.mjs';

export const GRAPHIFY_VERSION = '0.9.80';
export const GRAPHIFY_LOCK = resolve(import.meta.dirname, '../toolchain/graphify-requirements.lock');

async function verifyGraphifyVersion(venvPython, { env, run }) {
  const check = await run(venvPython, [
    '-c', 'import importlib.metadata; print(importlib.metadata.version("graphifyy"))'
  ], { cwd: resolve(venvPython, '../..'), env, timeout: 10000 });
  if (check.code !== 0 || check.timedOut || String(check.stdout || '').trim() !== GRAPHIFY_VERSION) {
    throw new Error(`Unexpected installed Graphify version: ${String(check.stdout || '').trim() || 'unknown'}`);
  }
}

export async function ensureGraphifyToolchain({
  directory,
  python = 'python3',
  env = process.env,
  run = boundedProcess,
  lockPath = GRAPHIFY_LOCK
}) {
  const binary = join(directory, 'bin', 'graphify');
  const venvPython = join(directory, 'bin', 'python');
  if (existsSync(binary) && existsSync(venvPython)) {
    await verifyGraphifyVersion(venvPython, { env, run });
    return binary;
  }
  if (!existsSync(lockPath)) throw new Error('Locked Graphify requirements missing');

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(resolve(directory, '..'), { recursive: true });
  const created = await run(python, ['-m', 'venv', directory], {
    cwd: resolve(directory, '..'), env, timeout: 60000
  });
  if (created.code !== 0 || created.timedOut) {
    throw new Error(created.timedOut ? 'Graphify venv creation timed out' : 'Graphify venv creation failed');
  }

  const installed = await run(venvPython, [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--no-deps', '-r', lockPath
  ], { cwd: resolve(directory, '..'), env, timeout: 180000 });
  if (installed.code !== 0 || installed.timedOut || !existsSync(binary)) {
    throw new Error(installed.timedOut ? 'Graphify locked install timed out' : 'Graphify locked install failed');
  }
  await verifyGraphifyVersion(venvPython, { env, run });
  return binary;
}

export async function buildRankedContext({
  candidate,
  directory,
  specification,
  binary = 'graphify',
  env = process.env,
  run = boundedProcess,
  now = () => Date.now()
}) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const started = now();
  const result = await run(binary, [
    'extract', '.', '--code-only', '--no-cluster', '--max-workers', '1', '--out', directory
  ], { cwd: candidate, env, timeout: 60000 });
  if (result.code !== 0 || result.timedOut) {
    throw new Error(result.timedOut ? 'Graphify extraction timed out' : 'Graphify extraction failed');
  }

  const graphPath = join(directory, 'graphify-out', 'graph.json');
  let graph;
  try {
    graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  } catch {
    throw new Error('Graphify graph.json missing or invalid');
  }
  const ranked = rankGraph(graph, specification);
  const elapsedMs = Math.max(0, now() - started);
  return {
    text: ranked.text,
    metadata: {
      mode: 'ranked-context',
      selectedFiles: ranked.selectedFiles,
      selectedFileCount: ranked.selectedFiles.length,
      selectedSymbols: ranked.selectedSymbols,
      rankedFiles: ranked.rankedFiles,
      chars: ranked.chars,
      graphNodes: ranked.graphNodes,
      graphEdges: ranked.graphEdges,
      schemaVersion: ranked.schemaVersion,
      graphifyVersion: GRAPHIFY_VERSION,
      preparationMs: elapsedMs
    }
  };
}
