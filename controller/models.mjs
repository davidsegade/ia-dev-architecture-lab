import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_MODEL_REGISTRY = resolve(import.meta.dirname, '../config/free-models.json');

export function loadModelRegistry(path = process.env.MODEL_REGISTRY_PATH || DEFAULT_MODEL_REGISTRY) {
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  return validateModelRegistry(registry);
}

export function validateModelRegistry(registry) {
  if (!registry || registry.provider !== 'opencode') throw new Error('Free model registry provider must be opencode');
  const roles = ['author', 'reviewer'];
  const seen = new Set();
  for (const role of roles) {
    if (!Array.isArray(registry[role]) || registry[role].length === 0) {
      throw new Error(`Free model registry requires at least one ${role} model`);
    }
    for (const entry of registry[role]) {
      if (!entry || typeof entry.id !== 'string' || !/^opencode\/[A-Za-z0-9._-]+$/.test(entry.id)) {
        throw new Error(`Invalid ${role} model id`);
      }
      if (entry.cost !== 0) throw new Error(`Non-zero-cost model forbidden: ${entry.id}`);
      if (seen.has(entry.id)) throw new Error(`Author/reviewer model pools must be disjoint: ${entry.id}`);
      seen.add(entry.id);
    }
  }
  return registry;
}

/** Parse `opencode models opencode --refresh` output. Unknown lines are ignored. */
export function parseAvailableModels(raw) {
  return [...new Set(String(raw || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^opencode\/[A-Za-z0-9._-]+$/.test(line))
  )];
}

export function runtimeModelsFromBase64(encoded) {
  if (!encoded) return [];
  let raw;
  try {
    raw = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    throw new Error('Invalid runtime model inventory');
  }
  return parseAvailableModels(raw);
}

export function candidatesFor(role, availableModels, registry = loadModelRegistry()) {
  if (!['author', 'reviewer'].includes(role)) throw new Error(`Unknown model role: ${role}`);
  const available = new Set(availableModels || []);
  return registry[role]
    .filter(entry => entry.cost === 0 && available.has(entry.id))
    .map(entry => entry.id);
}

export function selectCandidates(role, availableModels, registry = loadModelRegistry()) {
  const candidates = candidatesFor(role, availableModels, registry);
  if (!candidates.length) throw new Error(`No approved zero-cost ${role} model is currently available`);
  return candidates;
}
