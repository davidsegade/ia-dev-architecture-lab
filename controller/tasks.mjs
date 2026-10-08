import { createHash } from 'node:crypto';
import { loadConfig, tasksForPolicy } from './config.mjs';
import { profileFor } from './profiles.mjs';

export const tasks = Object.freeze({
  clamp: 'Implement clamp(value, minimum, maximum). All three arguments must be finite numbers or throw TypeError. If minimum > maximum throw RangeError. Return value bounded inclusively to minimum and maximum. Add tests while preserving baseline tests.',
  chunk: 'Implement chunk(values, size). Require an array and a positive safe integer size; throw TypeError for a non-array, RangeError for invalid size. Return consecutive arrays of at most size elements; an empty array returns []. Do not mutate input. Add tests while preserving baseline tests.',
  sumCents: 'Implement sumCents(values). Require an array of safe integer numbers (negative values allowed); invalid elements or non-array throw TypeError. Every intermediate sum must remain a safe integer or throw RangeError. Return the exact sum, 0 for empty. Add tests while preserving baseline tests.'
});

export function taskCatalog() {
  const registered = {};
  try {
    const targetRepo = process.env.GITHUB_REPOSITORY || process.env.TARGET_REPO;
    const policy = targetRepo ? loadConfig()[targetRepo] : undefined;
    if (policy) Object.assign(registered, tasksForPolicy(policy));
  } catch {
    // Policy unavailable: fall back to built-in synthetic tasks only.
  }
  return { ...tasks, ...registered };
}

export function taskFromIssue(body, allowedTasks = Object.keys(tasks)) {
  const match = /^task: (\S+)\s*$/m.exec(body);
  if (!match) {
    const loose = /(^|\n)\s*task:\s*(\S+)/.exec(body);
    const hint = loose
      ? ` Found "task: ${loose[2]}" on a line with other text; the marker must be alone on its own line.`
      : ` Expected a line containing only "task: <name>". Known tasks: ${allowedTasks.join(', ')}.`;
    throw new Error(`A registered synthetic task is required.${hint}`);
  }
  const task = match[1];
  if (!allowedTasks.includes(task)) {
    throw new Error(`Task ${task} not in allowlist. Known tasks: ${allowedTasks.join(', ')}`);
  }
  return task;
}

function exactProfile(body) {
  const matches = [...String(body).matchAll(/^profile: ([A-Za-z0-9-]+)\s*$/gm)];
  if (matches.length > 1) throw new Error('Exactly one profile marker is allowed');
  return matches[0]?.[1] || null;
}

function goalFromIssue(body, maxGoalChars) {
  const source = String(body);
  const match = /^goal:\s*(.*)$/m.exec(source);
  if (!match) throw new Error('code-change requires a goal: marker');
  const lineEnd = source.indexOf('\n', match.index);
  const first = match[1].trim();
  const rest = lineEnd === -1 ? '' : source.slice(lineEnd + 1).trim();
  const goal = [first, rest].filter(Boolean).join('\n').trim();
  if (!goal) throw new Error('code-change goal cannot be empty');
  if (goal.length > maxGoalChars) throw new Error(`code-change goal exceeds ${maxGoalChars} characters`);
  return goal;
}

/**
 * Parses an owner request without letting issue prose define policy.
 * Registered-task profiles select only engine-owned task specifications; goal profiles
 * accept bounded free-form task intent but never permissions, paths, commands or models.
 */
export function requestFromIssue(
  body,
  { taskCatalog: allowedCatalog = tasks, allowedProfiles = ['legacy-synthetic'] } = {}
) {
  const selected = exactProfile(body) || 'legacy-synthetic';
  const profile = profileFor(selected, allowedProfiles);

  if (profile.kind === 'registered-task') {
    const task = taskFromIssue(body, Object.keys(allowedCatalog));
    return {
      profile: selected,
      task,
      specification: allowedCatalog[task]
    };
  }

  if (profile.kind !== 'goal') throw new Error(`Profile ${selected} has unsupported request kind`);
  const specification = goalFromIssue(body, profile.maxGoalChars);
  return { profile: selected, task: 'goal', specification };
}

export function specificationDigest(specification) {
  return createHash('sha256').update(String(specification)).digest('hex');
}
