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

test('the publish gate reads tasks and profiles from this repository policy only', () => {
  const source = githubSource();
  assert.match(source, /const allowedTaskCatalog = tasksForPolicy\(repoConfig\)/);
  assert.match(source, /const allowedProfiles = repoConfig\.profiles \|\| \['legacy-synthetic'\]/);
  assert.match(source, /taskCatalog: allowedTaskCatalog/);
  assert.match(source, /allowedProfiles/);
  assert.doesNotMatch(source, /Object\.keys\(taskCatalog\(\)\)/);
});

test('requestFromIssue receives explicit repository task and profile policy', () => {
  const calls = callArguments(githubSource(), 'requestFromIssue');
  assert.equal(calls.length, 1, 'request parsing should be centralized');
  assert.match(calls[0], /taskCatalog:\s*allowedTaskCatalog/);
  assert.match(calls[0], /allowedProfiles/);
  assert.match(githubSource(), /const request = parseRequest\(\)/);
  assert.match(githubSource(), /const reviewed = parseRequest\(\)/);
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
