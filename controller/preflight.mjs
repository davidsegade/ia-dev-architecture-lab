import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWritePaths, isEngineSelfTask, verify } from './gate.mjs';
import { profileFor } from './profiles.mjs';

function output(values) {
  if (process.env.GITHUB_OUTPUT) {
    for (const [key, value] of Object.entries(values)) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }
  return values;
}

export function evaluateSyntheticPreflight({
  task,
  requestProfile,
  root = process.cwd(),
  workspaceRoot = '.',
  writePaths = getWritePaths(),
  acceptanceCommand = 'npm test',
  buildCommand = 'npm run build',
  targetRepo = null,
  engineRepo = null,
  verifyFn = verify
}) {
  const profile = profileFor(requestProfile);
  const wrongRepository = targetRepo && engineRepo && targetRepo !== engineRepo;
  if (wrongRepository || profile.kind !== 'registered-task' || !isEngineSelfTask(task)) {
    return { alreadySatisfied: false, eligible: false, acceptance: null };
  }

  const candidate = resolve(root, workspaceRoot);
  try {
    const acceptance = verifyFn(candidate, task, candidate, writePaths, acceptanceCommand, buildCommand);
    return { alreadySatisfied: acceptance?.passed === true, eligible: true, acceptance };
  } catch {
    return { alreadySatisfied: false, eligible: true, acceptance: null };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'preflight.mjs')) {
  const [task] = process.argv.slice(2);
  const result = evaluateSyntheticPreflight({
    task,
    requestProfile: process.env.REQUEST_PROFILE || 'legacy-synthetic',
    workspaceRoot: process.env.WORKSPACE_ROOT || '.',
    acceptanceCommand: process.env.ACCEPTANCE_COMMAND || 'npm test',
    buildCommand: process.env.BUILD_COMMAND || 'npm run build',
    targetRepo: process.env.TARGET_REPO || process.env.GITHUB_REPOSITORY || null,
    engineRepo: process.env.IA_DEV_ENGINE_REPOSITORY || null
  });
  const published = output({
    'already-satisfied': String(result.alreadySatisfied),
    'preflight-eligible': String(result.eligible),
    'preflight-cases': String(result.acceptance?.cases || 0)
  });
  console.log(JSON.stringify({ ...published, acceptance: result.acceptance }));
}
