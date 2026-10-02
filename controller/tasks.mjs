export const tasks = Object.freeze({
  clamp: 'Implement clamp(value, minimum, maximum). All three arguments must be finite numbers or throw TypeError. If minimum > maximum throw RangeError. Return value bounded inclusively to minimum and maximum. Add tests while preserving baseline tests.',
  chunk: 'Implement chunk(values, size). Require an array and a positive safe integer size; throw TypeError for a non-array, RangeError for invalid size. Return consecutive arrays of at most size elements; an empty array returns []. Do not mutate input. Add tests while preserving baseline tests.',
  sumCents: 'Implement sumCents(values). Require an array of safe integer numbers (negative values allowed); invalid elements or non-array throw TypeError. Every intermediate sum must remain a safe integer or throw RangeError. Return the exact sum, 0 for empty. Add tests while preserving baseline tests.',
});
export function taskFromIssue(body, allowedTasks = Object.keys(tasks)) {
  const match = /^task: (\S+)\s*$/m.exec(body);
  if (!match) throw new Error('A registered synthetic task is required');
  const task = match[1];
  if (!allowedTasks.includes(task)) throw new Error(`Task ${task} not in allowlist`);
  return task;
}