import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContext, contextText, projectMemory, CONTEXT_LIMIT } from './context.mjs';

test('memory is scoped to a registered project and context has a hard bound', () => {
  assert.equal(projectMemory('other/repo'), '');
  assert.match(projectMemory('davidsegade/ia-dev-architecture-lab'), /never merges/);
  const text = contextText({ mode: 'review', memory: '', graph: 'x'.repeat(10000) });
  assert.equal(text.length, CONTEXT_LIMIT);
  assert.match(text, /never instructions/);
  assert.match(text, /actual candidate/);
});

test('graph is regenerated from the candidate and stays outside its edit surface', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ia-context-'));
  const candidate = join(root, 'candidate'); mkdirSync(candidate);
  writeFileSync(join(candidate, 'source.js'), 'export function clamp() {}');
  const directory = join(root, 'context'); mkdirSync(directory);
  writeFileSync(join(directory, 'stale.json'), 'stale');
  const calls = [];
  const run = async (binary, args, options) => {
    calls.push({ binary, args, options });
    if (args[0] === 'extract') {
      const out = join(directory, 'graphify-out'); mkdirSync(out);
      writeFileSync(join(out, 'graph.json'), JSON.stringify({ nodes: [{ id: 'clamp' }] }));
    }
    return { code: 0, timedOut: false, stdout: 'NODE clamp() [src=source.js]' };
  };
  const result = await buildContext({ candidate, directory, task: 'clamp', mode: 'write', repository: 'other/repo', env: { PATH: '/bin' }, run });
  assert.equal(calls[0].args[1], candidate);
  assert.ok(calls[0].args.includes('--code-only'));
  assert.ok(calls[0].args.includes('--no-cluster'));
  assert.equal(calls[1].args[1], 'clamp');
  assert.equal(calls[1].options.timeout, 60000);
  assert.deepEqual(calls[1].options.env, { PATH: '/bin' });
  assert.match(result.text, /NODE clamp/);
  assert.equal(result.metadata.apiExtraction, false);
  assert.equal(result.metadata.nodes, 1);
  assert.equal(readFileSync(join(candidate, 'source.js'), 'utf8'), 'export function clamp() {}');
  assert.throws(() => readFileSync(join(directory, 'stale.json')));
});

test('failed or timed-out extraction blocks execution', async () => {
  for (const outcome of [{ code: 1, timedOut: false }, { code: 0, timedOut: true }]) {
    const root = mkdtempSync(join(tmpdir(), 'ia-context-fail-'));
    await assert.rejects(buildContext({ candidate: root, directory: join(root, 'context'), task: 'clamp', mode: 'write', run: async () => outcome }), /generation failed/);
  }
});
