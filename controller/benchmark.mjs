import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { profiles } from './profiles.mjs';
import { loadConfig, policyFor } from './config.mjs';
import { loadModelRegistry } from './models.mjs';
import { ensureGraphifyToolchain } from './context.mjs';

export const BENCHMARK_ARMS = ['legacy-synthetic', 'legacy-review-diff-synthetic', 'ranked-synthetic'];
const TOKEN_KEYS = ['input', 'output', 'reasoning', 'cachedRead', 'cachedWrite'];

export function validateProtocol(protocol) {
  if (protocol.schemaVersion !== 1 || protocol.task !== 'sumCents' || protocol.trials !== 3 ||
      JSON.stringify(protocol.arms) !== JSON.stringify(BENCHMARK_ARMS)) throw new Error('Invalid fixed benchmark protocol');
  for (const [name, maximum] of [['authorMs', 600000], ['reviewerMs', 300000], ['totalMs', 3600000]]) {
    if (!Number.isSafeInteger(protocol[name]) || protocol[name] < 1000 || protocol[name] > maximum) {
      throw new Error(`Invalid benchmark deadline: ${name}`);
    }
  }
  if (protocol.totalMs < protocol.trials * protocol.arms.length * (protocol.authorMs + protocol.reviewerMs) + 300000) throw new Error('Total deadline must reserve all nine arms plus setup');
  const registry = loadModelRegistry(resolve(import.meta.dirname, '../config/free-models.json'));
  for (const role of ['author', 'reviewer']) {
    if (!registry[role].some(entry => entry.id === protocol.models?.[role] && entry.cost === 0)) {
      throw new Error(`Unapproved free benchmark ${role} model`);
    }
  }
  if (protocol.models.author === protocol.models.reviewer) throw new Error('Independent model required');
  for (const arm of protocol.arms) {
    const profile = profiles[arm];
    if (profile.kind !== 'registered-task' || profile.authorAttempts !== 2 || profile.reviewerAttempts !== 1 || profile.maxGoalChars !== 0) {
      throw new Error('Benchmark profile changes task or retry permissions');
    }
  }
  return protocol;
}

export function trialSchedule(protocol) {
  validateProtocol(protocol);
  return Array.from({ length: protocol.trials }, (_, trial) => protocol.arms.map((_, position) => ({
    trial: trial + 1, position: position + 1, profile: protocol.arms[(position + trial) % protocol.arms.length]
  }))).flat();
}

export function verifyRuntimeCosts(raw, models) {
  const records = new Map();
  for (const part of String(raw).split(/(?=^opencode\/)/m)) {
    if (!part.startsWith('opencode/')) continue;
    const newline = part.indexOf('\n');
    records.set(part.slice(0, newline).trim(), JSON.parse(part.slice(newline + 1)));
  }
  return Object.values(models).map(id => {
    const model = records.get(id), cost = model?.cost;
    if (!cost || cost.input !== 0 || cost.output !== 0 || cost.cache?.read !== 0 || cost.cache?.write !== 0) {
      throw new Error(`Runtime zero cost not confirmed: ${id}`);
    }
    return { id, cost };
  });
}

// Timed-out traces are lower bounds, never completed runs with zero usage.
export function traceUsage(raw, attempt) {
  const events = String(raw).split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const steps = events.filter(event => event.type === 'step_finish').map(event => event.part);
  if (!steps.length) return { complete: false, observedCost: null, costConfirmed: null, tokens: null, steps: 0 };
  const zeroCost = steps.every(step => step?.cost === 0);
  const observedCost = steps.every(step => Number.isFinite(step?.cost) && step.cost >= 0)
    ? steps.reduce((sum, step) => sum + step.cost, 0) : null;
  const tokens = Object.fromEntries(TOKEN_KEYS.map(key => [key, 0]));
  let tokensKnown = true;
  for (const step of steps) {
    const source = step?.tokens || {};
    const values = { ...source, cachedRead: source.cache?.read, cachedWrite: source.cache?.write };
    for (const key of TOKEN_KEYS) {
      if (!Number.isFinite(values[key]) || values[key] < 0) tokensKnown = false;
      else tokens[key] += values[key];
    }
  }
  const complete = attempt?.code === 0 && !attempt?.timedOut && steps.at(-1)?.reason === 'stop' &&
    !events.some(event => event.type === 'error') && zeroCost && tokensKnown;
  return { complete, observedCost, costConfirmed: complete ? 0 : null,
    tokens: tokensKnown ? tokens : null, steps: steps.length };
}

// A controller's OpenCode child creates its own process group. Stop the owned
// descendant tree as well as the controller group to avoid orphaning that child.
export function killOwnedTree(pid) {
  const signal = (id, sig) => { try { process.kill(id, sig); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
  const descendants = () => {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 3000 });
    const pairs = rows.trim().split('\n').map(row => row.trim().split(/\s+/).map(Number));
    const owned = new Set([pid]);
    for (let changed = true; changed;) {
      changed = false;
      for (const [child, parent] of pairs) if (owned.has(parent) && !owned.has(child)) { owned.add(child); changed = true; }
    }
    return [...owned];
  };
  let owned = [pid];
  try {
    owned = descendants();
    signal(pid, 'SIGSTOP');
    for (const child of owned) signal(child, 'SIGSTOP');
    owned = [...new Set([...owned, ...descendants()])];
  } finally {
    for (const child of [...owned].reverse()) signal(child, 'SIGKILL');
    signal(-pid, 'SIGKILL');
  }
  return owned;
}

export async function runStage(binary, args, { cwd, env, timeout, logPath, onTick = () => {} }) {
  const started = performance.now(), fd = openSync(logPath, 'w');
  return await new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    let timedOut = false, killedPids = [];
    const elapsed = () => Math.round(performance.now() - started);
    const timer = setTimeout(() => {
      timedOut = true;
      try { killedPids = killOwnedTree(child.pid); } catch (error) { clearInterval(tick); reject(error); }
    }, timeout);
    const tick = setInterval(() => onTick({ pid: child.pid, elapsedMs: elapsed() }), 2000);
    child.once('error', error => { clearTimeout(timer); clearInterval(tick); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); clearInterval(tick); done({ code, timedOut, elapsedMs: elapsed(), killedPids });
    });
    onTick({ pid: child.pid, elapsedMs: 0 });
  });
}

export function roleEvidence(directory, role) {
  const resultPath = join(directory, 'bundle', `${role}-result.json`);
  if (!existsSync(resultPath)) return { result: null, traces: [], completeUsage: false };
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  const traces = result.attempts.map(attempt => {
    const path = join(directory, 'bundle', `${role}-${attempt.run}.jsonl`);
    return { run: attempt.run, timedOut: attempt.timedOut, error: attempt.error || null,
      usage: traceUsage(existsSync(path) ? readFileSync(path, 'utf8') : '', attempt) };
  });
  return { result, traces, completeUsage: traces.length > 0 && traces.every(trace => trace.usage.complete) };
}

export async function runBenchmark(source, output) {
  source = resolve(source); output = resolve(output);
  if (existsSync(output) || output === source || output.startsWith(source + sep)) throw new Error('Use a fresh output directory outside the checkout');
  // Check cleanup capability before launching any independently detached model.
  execFileSync('ps', ['-axo', 'pid=,ppid='], { timeout: 3000, stdio: 'ignore' });
  const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8', timeout: 15000 }).trim();
  if (git('status', '--porcelain')) throw new Error('Clean immutable engine checkout required');
  const sha = git('rev-parse', 'HEAD');
  const protocol = validateProtocol(JSON.parse(readFileSync(join(source, 'config/context-benchmark.json'), 'utf8')));
  const savedConfig = process.env.CONFIG_PATH;
  let policy;
  try {
    process.env.CONFIG_PATH = join(source, 'config/repositories.yml');
    policy = policyFor('davidsegade/ia-dev-architecture-lab', loadConfig());
  } finally {
    if (savedConfig === undefined) delete process.env.CONFIG_PATH; else process.env.CONFIG_PATH = savedConfig;
  }
  if (!protocol.arms.every(arm => policy.profiles.includes(arm))) throw new Error('Benchmark profile outside repository policy');
  const opencode = process.env.OPENCODE_BIN || 'opencode';
  const expectedVersion = JSON.parse(readFileSync(join(source, 'toolchain/package.json'), 'utf8')).dependencies['opencode-ai'];
  if (execFileSync(opencode, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim() !== expectedVersion) throw new Error('Pinned OpenCode version required');
  mkdirSync(output);
  const started = performance.now(), entries = [], schedule = trialSchedule(protocol);
  const update = extra => {
    const state = { sourceSha: sha, protocol, schedule, elapsedMs: Math.round(performance.now() - started), entries, ...extra };
    writeFileSync(join(output, 'status.tmp'), JSON.stringify(state, null, 2));
    renameSync(join(output, 'status.tmp'), join(output, 'status.json'));
  };
  update({ state: 'running', stage: 'setup' });
  try {
    const inventory = execFileSync(opencode, ['models', 'opencode', '--verbose'], { encoding: 'utf8', timeout: 30000, maxBuffer: 2000000 });
    const costs = verifyRuntimeCosts(inventory, protocol.models);
    writeFileSync(join(output, 'model-costs.json'), JSON.stringify(costs, null, 2));
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'en_US.UTF-8',
      OPENCODE_BIN: opencode, RUNTIME_MODEL_DISCOVERY_REQUIRED: 'true',
      AVAILABLE_MODELS_BASE64: Buffer.from(Object.values(protocol.models).join('\n')).toString('base64'),
      IA_DEV_ENGINE_REPOSITORY: 'davidsegade/ia-dev-architecture-lab', TARGET_REPO: 'davidsegade/ia-dev-architecture-lab',
      ACCEPTANCE_COMMAND: policy.acceptance_command, BUILD_COMMAND: policy.build_command, WORKSPACE_ROOT: '.' };
    for (const key of ['write_paths', 'context_paths', 'protected_paths', 'sensitive_paths']) env[key.toUpperCase()] = JSON.stringify(policy[key]);
    const baseline = spawnSync(process.execPath, [join(source, 'acceptance/check.mjs'), protocol.task, source], {
      env: { PATH: env.PATH, LANG: env.LANG }, encoding: 'utf8', timeout: 15000
    });
    if (baseline.error || baseline.status !== 1 || !baseline.stderr.includes('AssertionError')) throw new Error('Unmet baseline acceptance must be confirmed');
    const setupStarted = performance.now();
    env.GRAPHIFY_BIN = await ensureGraphifyToolchain({ directory: join(output, 'graphify-venv'),
      env: { PATH: env.PATH, HOME: output, LANG: env.LANG, GRAPHIFY_NO_BACKUP: '1', DO_NOT_TRACK: '1' } });
    writeFileSync(join(output, 'setup.json'), JSON.stringify({ graphifySetupMs: Math.round(performance.now() - setupStarted), baselineAcceptancePassed: false }));
    writeFileSync(join(output, 'manifest.json'), JSON.stringify({ sourceSha: sha, protocol, schedule, costs,
      specificationDigest: createHash('sha256').update(policy.tasks.find(task => task[protocol.task])[protocol.task]).digest('hex') }, null, 2));
    let paidCostObserved = false;
    for (const item of schedule) {
      if (paidCostObserved) {
        entries.push({ ...item, outcome: 'not-started-nonzero-cost', success: false }); continue;
      }
      const remaining = protocol.totalMs - (performance.now() - started);
      if (remaining < protocol.authorMs + protocol.reviewerMs) {
        entries.push({ ...item, outcome: 'not-started-total-deadline', success: false }); continue;
      }
      const name = `trial-${item.trial}-${item.profile}`, directory = join(output, name);
      execFileSync('git', ['clone', '--no-hardlinks', source, directory], { timeout: 15000, stdio: 'ignore' });
      execFileSync('git', ['checkout', '--detach', sha], { cwd: directory, timeout: 15000, stdio: 'ignore' });
      const armEnv = { ...env, REQUEST_PROFILE: item.profile, IA_DEV_ENGINE: directory };
      const entry = { ...item, sourceSha: sha, success: false };
      entries.push(entry);
      for (const [role, mode, timeout] of [['author', 'write', protocol.authorMs], ['reviewer', 'review', protocol.reviewerMs]]) {
        entry[role] = await runStage(process.execPath, [join(directory, 'controller/agent.mjs'), mode, protocol.task], {
          cwd: directory, env: armEnv, timeout, logPath: join(output, `${name}-${role}.log`),
          onTick: active => update({ state: 'running', stage: `${name}-${role}`, active })
        });
        entry[`${role}Evidence`] = roleEvidence(directory, mode);
        paidCostObserved ||= entry[`${role}Evidence`].traces.some(trace => trace.usage.observedCost > 0);
        if (paidCostObserved) break;
        if (entry[role].code !== 0 || entry[role].timedOut || !entry[`${role}Evidence`].result?.success) break;
      }
      entry.success = Boolean(entry.authorEvidence?.result?.success && entry.reviewerEvidence?.result?.approved &&
        entry.author?.code === 0 && entry.reviewer?.code === 0 && !entry.author.timedOut && !entry.reviewer.timedOut);
      entry.outcome = entry.success ? 'accepted-reviewed' : 'failed';
      writeFileSync(join(output, 'results.json'), JSON.stringify(entries, null, 2));
    }
    writeFileSync(join(output, 'results.json'), JSON.stringify(entries, null, 2));
    update({ state: 'completed', stage: 'finished', successCount: entries.filter(entry => entry.success).length });
    return entries;
  } catch (error) {
    update({ state: 'failed', stage: 'controller', error: error.message }); throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const output = process.argv[2];
  if (!output) throw new Error('Fresh output path required');
  const entries = await runBenchmark(resolve(import.meta.dirname, '..'), output);
  console.log(JSON.stringify({ planned: entries.length, acceptedReviewed: entries.filter(entry => entry.success).length }));
}
