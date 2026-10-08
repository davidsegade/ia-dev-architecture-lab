import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { boundedProcess } from './process.mjs';
import { rankGraph } from './context-ranker.mjs';

export const GRAPHIFY_VERSION = '0.9.80';

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
  const ranked = rankGraph(graph, specification, { expectedGraphifyVersion: GRAPHIFY_VERSION });
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
      graphifyVersion: ranked.graphifyVersion,
      preparationMs: elapsedMs
    }
  };
}
