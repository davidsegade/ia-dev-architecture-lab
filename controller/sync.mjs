import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
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
 * already checked against the write allowlist, and only those files are copied back.
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

/**
 * Copies the readable part of a repository into the agent sandbox.
 *
 * `patterns` are context/read globs. `excludedPatterns` are engine-owned sensitive
 * globs that must never enter model context even when a broad context glob would match.
 * Symbolic links are left out rather than followed.
 *
 * @returns the relative paths copied into the sandbox.
 */
export function copySandbox(src, dest, patterns, excludedPatterns = []) {
  const names = listFiles(src).filter(name => {
    if (!patterns.some(pattern => matchesPath(name, pattern))) return false;
    if (excludedPatterns.some(pattern => matchesPath(name, pattern))) return false;
    return !lstatSync(resolve(src, name)).isSymbolicLink();
  });
  for (const name of names) {
    const destination = resolve(dest, name);
    mkdirSync(resolve(destination, '..'), { recursive: true });
    cpSync(resolve(src, name), destination);
  }
  return names;
}

/** True when every changed path is covered by the write allowlist globs. */
export function withinAllowedPaths(names, allowedPaths) {
  return names.every(name => allowedPaths.some(pattern => matchesPath(name, pattern)));
}

/** True when any path matches one of the supplied policy globs. */
export function matchesAnyPath(names, patterns = []) {
  return names.some(name => patterns.some(pattern => matchesPath(name, pattern)));
}

/**
 * Lists the sandbox files as slash separated paths relative to `base`.
 * Symbolic links are listed rather than followed or rejected here, so callers can
 * decide whether a link is a violation.
 */
export function listFiles(base, prefix = '') {
  const names = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) names.push(...listFiles(resolve(base, entry.name), `${name}/`));
    else names.push(name);
  }
  return names;
}

/**
 * The concrete files a set of policy globs covers inside `base`.
 * A pattern without any wildcard must match a real file, so a policy naming a single
 * file cannot silently match nothing.
 */
export function filesUnder(base, patterns) {
  const names = listFiles(base);
  const covered = names.filter(name => patterns.some(pattern => matchesPath(name, pattern)));
  const required = patterns
    .filter(pattern => !pattern.includes('*'))
    .filter(pattern => !covered.includes(pattern));
  return [...new Set([...covered, ...required])];
}

/** Matches a sandbox path against a policy glob, where `*` and `**` match within a name. */
export function matchesPath(name, pattern) {
  const source = pattern
    .split('**')
    .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`).test(name);
}
