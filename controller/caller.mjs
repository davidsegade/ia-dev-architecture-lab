/**
 * Structural validation of a workflow that calls the engine's composite actions.
 *
 * A caller wires its jobs together by reading composite outputs, and a step id that
 * does not exist resolves to an empty string rather than an error. That failure mode is
 * silent: every job goes green while the job that depended on the output is skipped.
 * This module finds those references so a caller can refuse to run instead.
 */

/**
 * Job output expressions of the form `${{ steps.<id>.outputs.<name> }}`.
 * @returns [{ job, step, output, line }]
 */
export function jobOutputReferences(source) {
  const lines = source.split('\n');
  const jobs = splitJobs(lines);
  const references = [];

  for (const job of jobs) {
    for (const output of outputsOf(job)) {
      for (const match of output.value.matchAll(/steps\.([\w-]+)\.outputs\.([\w-]+)/g)) {
        references.push({ job: job.name, step: match[1], output: match[2], line: output.line });
      }
    }
  }
  return references;
}

/** Job output expressions that read a step id no step in that job declares. */
export function missingStepIds(source) {
  const lines = source.split('\n');
  const jobs = splitJobs(lines);
  const problems = [];

  for (const job of jobs) {
    const declared = new Set(
      job.lines
        .map(line => /^ {8}id: ([\w-]+)$/.exec(line))
        .filter(Boolean)
        .map(match => match[1])
    );
    for (const output of outputsOf(job)) {
      for (const match of output.value.matchAll(/steps\.([\w-]+)\.outputs\.([\w-]+)/g)) {
        if (!declared.has(match[1])) {
          problems.push({
            job: job.name,
            step: match[1],
            output: match[2],
            line: output.line,
            message:
              `job ${job.name} publishes ${output.name} from steps.${match[1]}.outputs.${match[2]}, ` +
              `but no step in that job has "id: ${match[1]}"`
          });
        }
      }
    }
  }
  return problems;
}

/** Job output expressions that name a job which does not exist. */
export function unknownJobReferences(source) {
  const lines = source.split('\n');
  const jobs = splitJobs(lines);
  const known = new Set(jobs.map(job => job.name));
  const problems = [];

  for (const job of jobs) {
    const needs = job.lines
      .map(line => /^ {4}needs: (.+)$/.exec(line))
      .filter(Boolean)
      .flatMap(match => match[1].replace(/[[\]\s]/g, '').split(',').filter(Boolean));
    for (const dependency of needs) {
      if (!known.has(dependency)) {
        problems.push({
          job: job.name,
          message: `job ${job.name} needs "${dependency}", which is not a job in this workflow`
        });
      }
    }
    for (const line of job.lines) {
      for (const match of line.matchAll(/needs\.([\w-]+)\./g)) {
        if (!known.has(match[1])) {
          problems.push({
            job: job.name,
            message: `job ${job.name} reads needs.${match[1]}, which is not a job in this workflow`
          });
        }
      }
    }
  }
  return problems;
}

/** Every structural problem, for a caller that wants one answer. */
export function validateCaller(source) {
  return [...unknownJobReferences(source), ...missingStepIds(source)];
}

function splitJobs(lines) {
  const jobs = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^ {2}([\w-]+):$/.exec(lines[i]);
    if (!match) continue;
    const name = match[1];
    let end = i + 1;
    while (end < lines.length && !/^ {0,2}\S/.test(lines[end])) end++;
    jobs.push({ name, line: i + 1, lines: lines.slice(i, end) });
    i = end - 1;
  }
  return jobs;
}

function outputsOf(job) {
  const outputs = [];
  let inOutputs = false;
  for (const [index, line] of job.lines.entries()) {
    if (/^ {4}outputs:$/.test(line)) {
      inOutputs = true;
      continue;
    }
    if (inOutputs && /^ {4}\S/.test(line)) inOutputs = false;
    if (!inOutputs) continue;
    const match = /^ {6}([\w-]+):\s*(.+)$/.exec(line);
    if (match) outputs.push({ name: match[1], value: match[2], line: job.line + index });
  }
  return outputs;
}