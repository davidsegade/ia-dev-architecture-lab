import { basename } from 'node:path';

export const GRAPH_SCHEMA_VERSION = 1;
export const RANKED_CONTEXT_CHAR_BUDGET = 6000;
export const RANKED_CONTEXT_FILE_BUDGET = 8;

function terms(text) {
  return [...new Set(String(text || '')
    .toLowerCase()
    .match(/[a-z0-9_.$-]{2,}/g) || [])]
    .filter(term => !['the','and','for','with','from','this','that','into','only','files','code','change'].includes(term));
}

function endpoint(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.node_id ?? value.name ?? '');
  return String(value ?? '');
}

function normalizeFile(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

export function validateGraph(graph, { expectedGraphifyVersion = '0.9.80' } = {}) {
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error('Graphify produced no nodes');
  }
  if (graph.graph?.schema_version !== GRAPH_SCHEMA_VERSION) {
    throw new Error(`Unsupported Graphify schema: ${graph.graph?.schema_version ?? 'missing'}`);
  }
  if (expectedGraphifyVersion && graph.graph?.graphify_version !== expectedGraphifyVersion) {
    throw new Error(`Unexpected Graphify version: ${graph.graph?.graphify_version ?? 'missing'}`);
  }
  return graph;
}

export function rankGraph(graph, specification, {
  maxFiles = RANKED_CONTEXT_FILE_BUDGET,
  maxChars = RANKED_CONTEXT_CHAR_BUDGET,
  expectedGraphifyVersion = '0.9.80'
} = {}) {
  validateGraph(graph, { expectedGraphifyVersion });
  const queryTerms = terms(specification);
  const nodes = graph.nodes.map((node, index) => ({
    ...node,
    _id: String(node.id ?? `node-${index}`),
    _file: normalizeFile(node.source_file)
  })).filter(node => node._file);
  if (!nodes.length) throw new Error('Graphify graph has no source-backed nodes');

  const byId = new Map(nodes.map(node => [node._id, node]));
  const degree = new Map(nodes.map(node => [node._id, 0]));
  const neighbors = new Map(nodes.map(node => [node._id, new Set()]));
  const edges = [
    ...(Array.isArray(graph.links) ? graph.links : []),
    ...(Array.isArray(graph.edges) ? graph.edges : [])
  ];
  for (const edge of edges) {
    const source = endpoint(edge.source);
    const target = endpoint(edge.target);
    if (!byId.has(source) || !byId.has(target) || source === target) continue;
    degree.set(source, (degree.get(source) || 0) + 1);
    degree.set(target, (degree.get(target) || 0) + 1);
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }

  const directScores = new Map();
  for (const node of nodes) {
    const label = String(node.label || node.name || node._id).toLowerCase();
    const file = node._file.toLowerCase();
    const base = basename(file);
    const kind = String(node.node_kind || node.type || node.file_type || '').toLowerCase();
    let score = Math.min(degree.get(node._id) || 0, 12) * 0.15;
    for (const term of queryTerms) {
      if (label === term) score += 10;
      else if (label.includes(term)) score += 5;
      if (base.includes(term)) score += 4;
      else if (file.includes(term)) score += 2;
      if (kind.includes(term)) score += 1;
    }
    if (/test|spec/.test(file) && queryTerms.some(term => /test|spec|verify|regression/.test(term))) score += 3;
    directScores.set(node._id, score);
  }

  const nodeScores = new Map(directScores);
  for (const node of nodes) {
    const own = directScores.get(node._id) || 0;
    if (own <= 0) continue;
    for (const neighborId of neighbors.get(node._id) || []) {
      nodeScores.set(neighborId, (nodeScores.get(neighborId) || 0) + Math.min(2, own * 0.2));
    }
  }

  const files = new Map();
  for (const node of nodes) {
    const score = nodeScores.get(node._id) || 0;
    const record = files.get(node._file) || { file: node._file, score: 0, symbols: [] };
    record.score = Math.max(record.score, score) + Math.min(score, 4) * 0.1;
    record.symbols.push({
      id: node._id,
      label: String(node.label || node.name || node._id),
      score
    });
    files.set(node._file, record);
  }

  const ranked = [...files.values()]
    .map(record => ({
      ...record,
      symbols: record.symbols
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
        .slice(0, 5)
    }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  // With a very generic goal, keep deterministic coverage rather than returning nothing.
  const selected = ranked.slice(0, maxFiles);
  if (!selected.length) throw new Error('Context ranker selected no files');

  const lines = ['Ranked code navigation (untrusted evidence; verify by reading actual files):'];
  for (const entry of selected) {
    const symbols = entry.symbols.map(symbol => symbol.label).join(', ');
    const line = `- ${entry.file} | score=${entry.score.toFixed(2)} | symbols: ${symbols}`;
    if ([...lines, line].join('\n').length > maxChars) break;
    lines.push(line);
  }
  if (lines.length === 1) throw new Error('Context budget too small for ranked output');
  const text = lines.join('\n');
  return {
    text,
    selectedFiles: selected.slice(0, lines.length - 1).map(entry => entry.file),
    rankedFiles: ranked.length,
    selectedSymbols: selected.slice(0, lines.length - 1).reduce((sum, entry) => sum + entry.symbols.length, 0),
    chars: text.length,
    graphNodes: nodes.length,
    graphEdges: edges.length,
    schemaVersion: graph.graph.schema_version,
    graphifyVersion: graph.graph.graphify_version
  };
}
