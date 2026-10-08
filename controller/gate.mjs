import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { filesUnder, matchesPath } from './sync.mjs';

export function command(cmd, args, cwd, timeout = 15000, env = process.env) {
  const result = spawnSync(cmd, args, { cwd, timeout, env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.error?.code || result.stderr || result.stdout}`);
  return result.stdout;
}

export function parsePathList(raw, fallback) {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed.split(',').map(entry => entry.trim()).filter(Boolean);
}

/** Explicit IA DEV 2.1 write surface, with IA DEV 2.0 ALLOWED_PATHS fallback. */
export function getWritePaths() {
  return parsePathList(process.env.WRITE_PATHS || process.env.ALLOWED_PATHS, ['src/main.mjs', 'tests/main.test.mjs']);
}

/** Read/context surface. It may be broader than write paths, never narrower by accident. */
export function getContextPaths() {
  return parsePathList(process.env.CONTEXT_PATHS, getWritePaths());
}

/** Files matching these globs must never enter an agent/context-builder sandbox. */
export function getSensitivePaths() {
  return parsePathList(process.env.SENSITIVE_PATHS, []);
}

/** Backward-compatible alias used by IA DEV 2.0 tests and publication code. */
export function getAllowedPaths() {
  return getWritePaths();
}

export function getProtectedPaths() {
  return parsePathList(process.env.PROTECTED_PATHS, ['config/repositories.yml', '.github/**', 'controller/**', 'package.json']);
}

export function inspectPatch(patch, writePaths = getWritePaths(), protectedPaths = getProtectedPaths()) {
  if (!patch || Buffer.byteLength(patch) > 100000) throw new Error('Missing or oversized patch');
  const headers = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  if (!headers.length) throw new Error('No changes');
  for (const [, left, right] of headers) {
    if (left !== right) throw new Error('Renames forbidden');
    const allowed = writePaths.some(pattern => matchesPath(right, pattern));
    if (protectedPaths.some(pattern => matchesPath(right, pattern))) throw new Error(`Protected path: ${right}`);
    if (!allowed) throw new Error(`Unauthorized path: ${right}`);
  }
  if (/^(?:new file mode|deleted file mode|old mode|new mode|rename |copy |GIT binary patch)/m.test(patch)) {
    throw new Error('File structure changes forbidden');
  }
  return createHash('sha256').update(patch).digest('hex');
}

/**
 * The engine's own synthetic tasks ship with an objective checker that goes beyond the
 * repository test suite. Every other repository brings its own acceptance command in
 * the engine policy file, so its commands are what decides.
 */
const ENGINE_SELF_TASKS = ['clamp', 'chunk', 'sumCents'];

/**
 * Independent acceptance of a change.
 *
 * `candidate` is the filtered sandbox the agent edited. Only write paths are validated
 * as publication candidates; broader context files are read-only evidence.
 */
export function verify(root, task, candidate, writePaths = getWritePaths(), acceptanceCommand = 'npm test', buildCommand = 'npm run build') {
  for (const name of filesUnder(candidate, writePaths)) {
    const fullPath = resolve(candidate, name);
    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      throw new Error(`Regular file required: ${name} (missing)`);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Regular file required: ${name}`);
    }
  }

  if (ENGINE_SELF_TASKS.includes(task)) {
    const directory=realpathSync(candidate);
    const env={PATH:process.env.PATH,LANG:'en_US.UTF-8'};
    const permissions=['--permission',`--allow-fs-read=${directory}`];
    command(process.execPath, [...permissions,'--check',resolve(directory,'src/main.mjs')],root,15000,env);
    command(process.execPath, [...permissions,'--test','--test-isolation=none','tests/main.test.mjs'],directory,15000,env);
    const acceptance = command(process.execPath, [resolve(import.meta.dirname, '../acceptance/check.mjs'), task, directory], root, 5000,env);
    return JSON.parse(acceptance.trim());
  }

  const build = command('sh', ['-c', buildCommand], root, 900000).trim();
  const acceptance = command('sh', ['-c', acceptanceCommand], root, 900000).trim();
  return { task, build, acceptance, passed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'gate.mjs')) {
  const [task, patchFile] = process.argv.slice(2);
  const writePaths = getWritePaths();
  const root = process.cwd();
  const workspaceRoot = process.env.WORKSPACE_ROOT || '.';
  const acceptanceCommand = process.env.ACCEPTANCE_COMMAND || 'npm test';
  const buildCommand = process.env.BUILD_COMMAND || 'npm run build';
  const digest = inspectPatch(readFileSync(patchFile, 'utf8'), writePaths);
  command('git', ['apply', '--check', patchFile], root);
  command('git', ['apply', patchFile], root);
  const verified = verify(resolve(root, workspaceRoot), task, root, writePaths, acceptanceCommand, buildCommand);
  console.log(JSON.stringify({ digest, ...verified }));
}
