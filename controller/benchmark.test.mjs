import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateProtocol, trialSchedule, verifyRuntimeCosts, traceUsage, runStage, roleEvidence } from './benchmark.mjs';

const protocol = JSON.parse(readFileSync(new URL('../config/context-benchmark.json', import.meta.url), 'utf8'));
const step = (reason = 'stop', cost = 0) => JSON.stringify({ type: 'step_finish', part: {
  reason, cost, tokens: { input: 10, output: 2, reasoning: 1, cache: { read: 5, write: 0 } }
} });

test('three repetitions balance every arm over every order position', () => {
  const schedule = trialSchedule(protocol);
  assert.equal(schedule.length, 9);
  for (const profile of protocol.arms) {
    const selected = schedule.filter(item => item.profile === profile);
    assert.deepEqual(selected.map(item => item.trial), [1, 2, 3]);
    assert.deepEqual(selected.map(item => item.position).sort(), [1, 2, 3]);
  }
  assert.deepEqual(schedule, trialSchedule(protocol));
});

test('protocol refuses free-form goals, invented arms, excessive limits and paid models', () => {
  for (const change of [
    { task: 'goal' }, { arms: [...protocol.arms, 'code-change'] }, { trials: 30 },
    { models: { ...protocol.models, author: 'opencode/paid' } },
    { models: { author: protocol.models.author, reviewer: protocol.models.author } },
    { authorMs: 0 }, { totalMs: 99999999 }, { totalMs: 1000 }, { totalMs: protocol.authorMs + protocol.reviewerMs }
  ]) assert.throws(() => validateProtocol({ ...protocol, ...change }));
});

test('runtime inventory must explicitly confirm all four zero-cost fields', () => {
  const inventory = (id, cost) => `${id}\n${JSON.stringify({ id, cost })}\n`;
  const free = { input: 0, output: 0, cache: { read: 0, write: 0 } };
  const raw = Object.values(protocol.models).map(id => inventory(id, free)).join('');
  assert.equal(verifyRuntimeCosts(raw, protocol.models).length, 2);
  for (const cost of [{ ...free, output: 1 }, { input: 0, output: 0 }, { ...free, cache: { read: 1, write: 0 } }]) {
    assert.throws(() => verifyRuntimeCosts(inventory(protocol.models.author, cost) + inventory(protocol.models.reviewer, free), protocol.models), /zero cost not confirmed/);
  }
  assert.throws(() => verifyRuntimeCosts('', protocol.models), /zero cost not confirmed/);
});

test('timeout traces retain partial tokens but never confirm a completed zero-cost run', () => {
  const usage = traceUsage(step('tool-calls'), { code: null, timedOut: true });
  assert.equal(usage.complete, false);
  assert.equal(usage.tokens.input, 10);
  assert.equal(usage.observedCost, 0);
  assert.equal(usage.costConfirmed, null);
  assert.equal(traceUsage('', { code: null, timedOut: true }).tokens, null);
  assert.equal(traceUsage('', { code: null, timedOut: true }).observedCost, null);
});

test('complete usage requires terminal stop, valid tokens, no provider error and zero cost', () => {
  assert.equal(traceUsage(step(), { code: 0, timedOut: false }).complete, true);
  assert.equal(traceUsage(step('tool-calls'), { code: 0, timedOut: false }).complete, false);
  assert.equal(traceUsage(step() + '\n' + JSON.stringify({ type: 'error' }), { code: 0 }).complete, false);
  const paid = traceUsage(step('stop', 2), { code: 0 });
  assert.equal(paid.complete, false);
  assert.equal(paid.observedCost, 2);
  assert.equal(paid.costConfirmed, null);
  assert.equal(traceUsage(JSON.stringify({ type: 'step_finish', part: { reason: 'stop', cost: 0 } }), { code: 0 }).tokens, null);
});

test('missing result after a killed controller stays unknown rather than zero usage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ia-dev-missing-result-'));
  assert.deepEqual(roleEvidence(directory, 'write'), { result: null, traces: [], completeUsage: false });
});

test('stage deadline kills an independently detached child as well as its controller', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ia-dev-stage-kill-'));
  const logPath = join(directory, 'stage.log');
  const program = `const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
    console.log(child.pid); setInterval(()=>{},1000);`;
  const result = await runStage(process.execPath, ['-e', program], {
    cwd: directory, env: { PATH: process.env.PATH }, timeout: 1000, logPath
  });
  assert.equal(result.timedOut, true);
  const childPid = Number(readFileSync(logPath, 'utf8').trim());
  assert.ok(result.killedPids.includes(childPid));
  // Killed descendants can briefly remain as zombies until adopted/reaped.
  const { execFileSync } = await import('node:child_process');
  try { assert.match(execFileSync('ps', ['-p', String(childPid), '-o', 'stat='], { encoding: 'utf8' }), /^Z/); }
  catch (error) { if (error.code !== undefined) throw error; assert.equal(error.status, 1); }
  assert.equal(existsSync(logPath), true);
});
