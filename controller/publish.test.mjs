import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(process.cwd(), 'controller');

function githubSource() {
  return readFileSync(join(root, 'github.mjs'), 'utf8');
}

/**
 * Runs the publish branch of the controller against a scratch repository and bundle.
 * Everything it touches before pushing is a local file, so the run stops at the git
 * push with no network involved.
 */
function publish({ body, review }) {
  const dir = join(process.cwd(), '.tmp-publish-fixture');
  execFileSync('mkdir', ['-p', join(dir, 'bundle')]);
  writeFileSync(join(dir, 'bundle', 'change.patch'), 'diff --git a/t b/t\n');
  writeFileSync(join(dir, 'bundle', 'review-result.json'), JSON.stringify(review));
  try {
    execFileSync(process.execPath, [join(root, 'github.mjs'), 'publish'], {
      cwd: dir,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'acme/not-allowlisted',
        GITHUB_EVENT_PATH: join(dir, 'event.json'),
        GH_TOKEN: 'unused',
        EXPECTED_DIGEST: 'ignored'
      },
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } finally {
    execFileSync('rm', ['-rf', dir]);
  }
}

test('the publish gate reads the task from the repository policy catalog', () => {
  // The regression: publish compared the review against the engine's own synthetic task
  // list, so a repository bringing its own task could never publish a pull request.
  const source = githubSource();
  assert.match(source, /taskFromIssue\(issue\.body \|\| '', Object\.keys\(taskCatalog\(\)\)\)/);
});

test('every taskFromIssue call site passes an explicit allowlist', () => {
  // taskFromIssue still defaults to the engine's synthetic tasks for its own unit tests,
  // but no controller entry point may rely on that default: a repository that brings its
  // own task would fail every check.
  const calls = callArguments(githubSource(), 'taskFromIssue');
  assert.ok(calls.length >= 2, 'expected the prepare and publish branches to read the task');
  for (const args of calls) {
    assert.match(
      args,
      /,\s*(allowedTasks|Object\.keys\(taskCatalog\(\)\))\s*$/,
      `taskFromIssue(${args}) leaves the task unchecked against the repository policy`
    );
  }
});

/** Argument lists of every call to `name`, with nested parentheses balanced. */
function callArguments(source, name) {
  const results = [];
  const pattern = new RegExp(`\\b${name}\\(`, 'g');
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 0;
    for (let i = match.index + name.length; i < source.length; i++) {
      if (source[i] === '(') depth++;
      if (source[i] === ')') {
        if (--depth === 0) {
          results.push(source.slice(match.index + name.length + 1, i));
          pattern.lastIndex = i + 1;
          break;
        }
      }
    }
  }
  return results;
}