import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const allowed = new Set(['src/main.mjs','tests/main.test.mjs']);
export function command(cmd, args, cwd, timeout = 15000) {
  const result = spawnSync(cmd, args, { cwd, timeout, encoding:'utf8', maxBuffer:1024*1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.error?.code || result.stderr || result.stdout}`);
  return result.stdout;
}
export function inspectPatch(patch) {
  if (!patch || Buffer.byteLength(patch) > 100000) throw new Error('Missing or oversized patch');
  const headers = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  if (!headers.length) throw new Error('No changes');
  for (const [,left,right] of headers) if (left !== right || !allowed.has(right)) throw new Error('Unauthorized path');
  if (/^(?:new file mode|deleted file mode|old mode|new mode|rename |copy |GIT binary patch)/m.test(patch)) throw new Error('File structure changes forbidden');
  return createHash('sha256').update(patch).digest('hex');
}
export function verify(root, task, candidate=root) {
  for (const file of allowed) if (!lstatSync(resolve(candidate,file)).isFile() || lstatSync(resolve(candidate,file)).isSymbolicLink()) throw new Error('Regular files required');
  command(process.execPath,['--check',resolve(candidate,'src/main.mjs')],root);
  command(process.execPath,['--test',resolve(candidate,'tests/main.test.mjs')],root);
  const acceptance = command(process.execPath,[resolve(root,'acceptance/check.mjs'),task,candidate],root,5000);
  return JSON.parse(acceptance.trim());
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname,'gate.mjs')) {
  const [task, patchFile] = process.argv.slice(2);
  const digest = inspectPatch(readFileSync(patchFile,'utf8'));
  command('git',['apply','--check',patchFile],process.cwd());
  command('git',['apply',patchFile],process.cwd());
  console.log(JSON.stringify({digest,...verify(process.cwd(),task)}));
}
