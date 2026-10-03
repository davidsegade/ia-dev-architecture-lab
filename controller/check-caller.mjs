#!/usr/bin/env node
/**
 * Refuses to run when the calling workflow is structurally broken.
 *
 * The engine's composite actions publish their results as step outputs. A caller that
 * reads an output from a step id no step declares gets an empty string instead of an
 * error, so the pipeline stays green while the job that depended on the output is
 * silently skipped. That is exactly what happened in TURNEO with the reviewer verdict.
 *
 * Usage: node controller/check-caller.mjs <workflow.yml> [<workflow.yml> ...]
 * Exits non-zero and prints every problem, so the run stops before spending a model call.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { validateCaller } from './caller.mjs';

/** Expands a directory into its workflow files; passes a file through. */
function expand(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map(name => join(path, name));
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: node check-caller.mjs <workflow.yml|workflow-dir> [...]');
  process.exit(2);
}

const problems = paths.flatMap(path => expand(path).flatMap(file =>
  validateCaller(readFileSync(file, 'utf8')).map(problem => ({ ...problem, file }))
));

if (problems.length) {
  for (const problem of problems) {
    console.error(
      `::error file=${problem.file},line=${problem.line || 0}::${problem.message}`
    );
  }
  console.error(`${problems.length} structural problem(s) in ${paths.join(', ')}`);
  process.exit(1);
}

console.log(`Caller structure OK: ${paths.join(', ')}`);