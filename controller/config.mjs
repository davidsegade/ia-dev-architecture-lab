// Central repository policy loader (allowlist, paths, tasks, commands).
// The engine owns this file; target repositories never define policy.
import { readFileSync } from 'node:fs';

export const DEFAULT_CONFIG_PATH = 'config/repositories.yml';

/**
 * Minimal parser for the engine-owned repository policy file.
 * Supported shape:
 *   repositories:
 *     owner/name:
 *       allowed_paths:
 *         - "lib/**"
 *       tasks:
 *         - task-name: "description"
 *       acceptance_command: "..."
 */
export function loadConfig() {
  const configPath = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH;
  const yaml = readFileSync(configPath, 'utf8');
  const repos = {};
  let currentRepo = null;
  let currentArrayKey = null;

  for (const line of yaml.split('\n')) {
    const arrayItemMatch = line.match(/^(\s*)-\s*(.*)$/);
    if (arrayItemMatch) {
      const [, spaces, item] = arrayItemMatch;
      const level = spaces.length / 2;
      if (level === 3 && currentRepo && currentArrayKey) {
        const value = item.trim().replace(/^["']|["']$/g, '');
        const kvMatch = value.match(/^([\w-]+):\s*(.*)$/);
        if (kvMatch) {
          repos[currentRepo][currentArrayKey].push({
            [kvMatch[1]]: kvMatch[2].replace(/^["']|["']$/g, '')
          });
        } else {
          repos[currentRepo][currentArrayKey].push(value);
        }
      }
      continue;
    }

    const match = line.match(/^(\s*)([\w/.@-]+):\s*(.*)$/);
    if (!match) continue;
    const [, spaces, key, value] = match;
    const level = spaces.length / 2;

    if (level === 1) {
      currentRepo = key;
      repos[currentRepo] = {};
      currentArrayKey = null;
    } else if (level === 2 && currentRepo) {
      if (value === '') {
        repos[currentRepo][key] = [];
        currentArrayKey = key;
      } else {
        repos[currentRepo][key] = value.replace(/^["']|["']$/g, '');
        currentArrayKey = null;
      }
    }
  }
  return repos;
}

/** Returns the policy entry for a repository, or throws if it is not allowlisted. */
export function policyFor(targetRepo, repositories = loadConfig()) {
  const policy = repositories[targetRepo];
  if (!policy) throw new Error(`Repository ${targetRepo} not in allowlist`);
  return policy;
}

/** Returns the registered task descriptions for a repository policy entry. */
export function tasksForPolicy(policy) {
  return Object.fromEntries(
    (policy.tasks || []).map(entry => {
      const [[name, description]] = Object.entries(entry);
      return [name, description];
    })
  );
}