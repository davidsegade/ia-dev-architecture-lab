#!/usr/bin/env node
/**
 * Refuses to run when the calling workflow is structurally broken.
 *
 * The engine's composite actions publish their results as step outputs. A caller that
 * reads an output from a step id no step declares gets an empty string instead of an
 * error, so the pipeline stays green while the job that depended on the output is
 * silently skipped. That is exactly what happened in TURNEO with the reviewer verdict.
 *
 * Usage: node controller/check-caller.mjs <workflow.yml>
 * Exits non-zero and prints every problem, so the run stops before spending a model call.
 */
import { readFileSync } from 'node:fs';

import { validateCaller } from './caller.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node check-caller.mjs <workflow.yml>');
  process.exit(2);
}

const problems = validateCaller(readFileSync(file, 'utf8'));

if (problems.length) {
  for (const problem of problems) {
    const where = problem.line ? `${file}:${problem.line}` : file;
    console.error(`::error file=${file},line=${problem.line || 0}::${problem.message}`);
    console.error(`  at ${where}`);
  }
  console.error(`${problems.length} structural problem(s) in ${file}`);
  process.exit(1);
}

console.log(`Caller structure OK: ${file}`);