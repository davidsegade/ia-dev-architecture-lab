import { cpSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/**
 * Resolves `name` inside `base`, or returns null when it would escape.
 * Candidate file names come from a directory walk and cannot contain `..`, so this is
 * defence in depth: the sandbox boundary does not depend on the caller being careful.
 */
function contained(base, name) {
  const boundary = resolve(base);
  const resolved = resolve(boundary, name);
  return resolved === boundary || resolved.startsWith(boundary + sep) ? resolved : null;
}

/**
 * Copies the agent's changes from the candidate sandbox back into the target tree.
 *
 * The allowlisted paths are globs such as `lib/**`, not file paths, so they cannot be
 * resolved on disk. The caller passes the concrete relative paths the agent changed,
 * already checked against the allowlist, and only those files are copied back.
 *
 * @returns the relative paths that were actually copied.
 */
export function copyBack(candidate, root, workspaceRoot, names) {
  const copied = [];
  for (const name of names) {
    const source = contained(candidate, name);
    if (!source || !existsSync(source) || !lstatSync(source).isFile()) continue;
    const destination = contained(resolve(root, workspaceRoot), name);
    if (!destination) continue;
    mkdirSync(resolve(destination, '..'), { recursive: true });
    cpSync(source, destination);
    copied.push(name);
  }
  return copied;
}

/**
 * Relative paths whose contents differ between two inventories, including paths the
 * agent removed. Names are the sandbox-relative, slash separated paths produced by the
 * inventory walk.
 */
export function changedPaths(baseline, after) {
  return [...new Set([...Object.keys(baseline), ...Object.keys(after)])]
    .filter(name => baseline[name] !== after[name]);
}

/** True when every changed path is covered by the allowlist globs. */
export function withinAllowedPaths(names, allowedPaths) {
  return names.every(name => allowedPaths.some(pattern => matchesPath(name, pattern)));
}

/** Matches a sandbox path against a policy glob, where `*` and `**` match within a name. */
export function matchesPath(name, pattern) {
  const source = pattern
    .split('**')
    .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`).test(name);
}