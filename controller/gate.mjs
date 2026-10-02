import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { filesUnder } from './sync.mjs';

export function command(cmd, args, cwd, timeout = 15000) {
  const result = spawnSync(cmd, args, { cwd, timeout, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.error?.code || result.stderr || result.stdout}`);
  return result.stdout;
}

export function parsePathList(raw, fallback) {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed.split(',').map(entry => entry.trim()).filter(Boolean);
}

export function getAllowedPaths() {
  return parsePathList(process.env.ALLOWED_PATHS, ['src/main.mjs', 'tests/main.test.mjs']);
}

export function getProtectedPaths() {
  return parsePathList(process.env.PROTECTED_PATHS, ['config/repositories.yml', '.github/**', 'controller/**', 'package.json']);
}

export function inspectPatch(patch, allowedPaths = getAllowedPaths()) {
  if (!patch || Buffer.byteLength(patch) > 100000) throw new Error('Missing or oversized patch');
  const headers = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  if (!headers.length) throw new Error('No changes');
  for (const [, left, right] of headers) {
    if (left !== right) throw new Error('Renames forbidden');
    const allowed = allowedPaths.some(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(right));
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
 * `candidate` is the filtered sandbox the agent edited, so it holds only the allowlisted
 * paths and cannot stand in for a build. The commands declared in the policy therefore
 * run in `root`, the full target checkout, after the change has been copied back. That
 * is what makes the acceptance independent of the agent: it is the repository's own
 * build and test entry points, run by the engine and not by the author.
 */
export function verify(root, task, candidate, allowedPaths = getAllowedPaths(), acceptanceCommand = 'npm test', buildCommand = 'npm run build') {
  for (const name of filesUnder(candidate, allowedPaths)) {
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
    command(process.execPath, ['--check', resolve(candidate, 'src/main.mjs')], root);
    command(process.execPath, ['--test', resolve(candidate, 'tests/main.test.mjs')], root);
    const acceptance = command(process.execPath, [resolve(root, 'acceptance/check.mjs'), task, candidate], root, 5000);
    return JSON.parse(acceptance.trim());
  }

  const build = command('sh', ['-c', buildCommand], root, 900000).trim();
  const acceptance = command('sh', ['-c', acceptanceCommand], root, 900000).trim();
  return { task, build, acceptance, passed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'gate.mjs')) {
  const [task, patchFile] = process.argv.slice(2);
  const allowedPaths = getAllowedPaths();
  const digest = inspectPatch(readFileSync(patchFile, 'utf8'), allowedPaths);
  command('git', ['apply', '--check', patchFile], process.cwd());
  command('git', ['apply', patchFile], process.cwd());
  console.log(JSON.stringify({ digest, ...verify(process.cwd(), task, process.cwd(), allowedPaths) }));
}