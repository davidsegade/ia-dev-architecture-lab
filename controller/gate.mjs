import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function command(cmd, args, cwd, timeout = 15000) {
  const result = spawnSync(cmd, args, { cwd, timeout, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.error?.code || result.stderr || result.stdout}`);
  return result.stdout;
}

function getAllowedPaths() {
  if (process.env.ALLOWED_PATHS) return JSON.parse(process.env.ALLOWED_PATHS);
  return ['src/main.mjs', 'tests/main.test.mjs'];
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

export function verify(root, task, candidate, allowedPaths = getAllowedPaths(), acceptanceCommand = 'npm test', buildCommand = 'npm run build') {
  for (const file of allowedPaths) {
    const fullPath = resolve(candidate, file);
    if (!lstatSync(fullPath).isFile() || lstatSync(fullPath).isSymbolicLink()) {
      throw new Error(`Regular file required: ${file}`);
    }
  }
  command(process.execPath, ['--check', resolve(candidate, 'src/main.mjs')], root);
  command(process.execPath, ['--test', resolve(candidate, 'tests/main.test.mjs')], root);
  
  const acceptance = command(process.execPath, [resolve(root, 'acceptance/check.mjs'), task, candidate], root, 5000);
  return JSON.parse(acceptance.trim());
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'gate.mjs')) {
  const [task, patchFile] = process.argv.slice(2);
  const allowedPaths = JSON.parse(process.env.ALLOWED_PATHS || '["src/main.mjs","tests/main.test.mjs"]');
  const digest = inspectPatch(readFileSync(patchFile, 'utf8'), allowedPaths);
  command('git', ['apply', '--check', patchFile], process.cwd());
  command('git', ['apply', patchFile], process.cwd());
  console.log(JSON.stringify({ digest, ...verify(process.cwd(), task, process.cwd(), allowedPaths) }));
}