import { loadConfig, tasksForPolicy } from './config.mjs';

export const tasks = Object.freeze({
  clamp: 'Implement clamp(value, minimum, maximum). All three arguments must be finite numbers or throw TypeError. If minimum > maximum throw RangeError. Return value bounded inclusively to minimum and maximum. Add tests while preserving baseline tests.',
  chunk: 'Implement chunk(values, size). Require an array and a positive safe integer size; throw TypeError for a non-array, RangeError for invalid size. Return consecutive arrays of at most size elements; an empty array returns []. Do not mutate input. Add tests while preserving baseline tests.',
  sumCents: 'Implement sumCents(values). Require an array of safe integer numbers (negative values allowed); invalid elements or non-array throw TypeError. Every intermediate sum must remain a safe integer or throw RangeError. Return the exact sum, 0 for empty. Add tests while preserving baseline tests.'
});

/**
 * Task catalog: the engine's built-in synthetic tasks merged with the tasks
 * registered for the current target repository in the engine-owned policy file.
 * A target repository can never invent a task; only the engine can register one.
 */
export function taskCatalog() {
  const registered = {};
  try {
    const targetRepo = process.env.GITHUB_REPOSITORY || process.env.TARGET_REPO;
    const policy = targetRepo ? loadConfig()[targetRepo] : undefined;
    if (policy) Object.assign(registered, tasksForPolicy(policy));
  } catch {
    // Policy unavailable: fall back to the built-in catalog only.
  }
  return { ...tasks, ...registered };
}

/**
 * Reads the synthetic task from an issue body.
 *
 * The marker must be a line of its own: `task: <name>`. Anything else is rejected
 * rather than guessed, because a task name selects the specification the agent and
 * the reviewer are held to, and a misread marker would silently change the contract.
 */
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