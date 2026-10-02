import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workflowsDir = join(process.cwd(), '.github', 'workflows');

function workflowFiles() {
  return readdirSync(workflowsDir)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map(name => join(workflowsDir, name));
}

function read(file) {
  return readFileSync(file, 'utf8');
}

/** Every `uses:` reference in the file, as raw strings. */
function usesReferences(source) {
  // Stop before the trailing "# tag" comment a pinned reference carries.
  return [...source.matchAll(/(?<![\w-])uses:[ \t]*([^\s#]+)/g)].map(match => match[1]);
}

test('no workflow references an action or workflow by a mutable ref', () => {
  const mutable = ['@main', '@master', '@HEAD', '@latest'];
  for (const file of workflowFiles()) {
    for (const reference of usesReferences(read(file))) {
      for (const tag of mutable) {
        assert.equal(
          reference.endsWith(tag),
          false,
          `${file} references ${reference} by a mutable ref; pin an exact SHA`
        );
      }
    }
  }
});

test('every workflow action is pinned to an exact commit', () => {
  for (const file of workflowFiles()) {
    for (const reference of usesReferences(read(file))) {
      if (reference.startsWith('./')) continue;
      assert.match(
        reference,
        /@[0-9a-f]{40}$/,
        `${file} uses ${reference}, which is not pinned to a full commit SHA`
      );
    }
  }
});

test('no workflow performs a merge', () => {
  for (const file of workflowFiles()) {
    const source = read(file);
    assert.equal(
      /gh\s+pr\s+merge|git\s+push[^\n]*\bmain\b|:main\b/.test(source) && /merge/.test(source),
      false,
      `${file} appears to merge into main`
    );
    assert.equal(
      /--admin/.test(source),
      false,
      `${file} bypasses branch protection with --admin`
    );
  }
});

test('only the publishing job holds write permissions', () => {
  for (const file of workflowFiles()) {
    const source = read(file);
    const writeScopes = ['contents: write', 'pull-requests: write', 'issues: write', 'statuses: write'];
    const hasWrite = writeScopes.some(scope => source.includes(scope));
    if (!hasWrite) continue;
    // A workflow that declares write scopes must scope them to a single job, so the
    // author and the reviewer jobs keep the read-only token.
    const writeBlocks = source.match(/^ {4}permissions:$/gm) || [];
    assert.ok(
      writeBlocks.length > 0,
      `${file} declares write permissions at workflow level; scope them to the publishing job`
    );
    assert.equal(
      /^permissions:\n {2}(contents|pull-requests|issues|statuses): write/m.test(source),
      false,
      `${file} grants write permissions to every job`
    );
  }
});

test('the engine test suite is wired into CI', () => {
  const ci = read(join(workflowsDir, 'ci.yml'));
  assert.match(ci, /npm run test:architecture/);
  assert.match(ci, /branches:\s*(\[main\]|\n\s*- main)/);
  assert.match(ci, /permissions:\s*\n {2}contents: read/);
});

test('no workflow reads a GitHub token from the repository target', () => {
  // The engine authenticates with the caller's GITHUB_TOKEN. A target repository must
  // never be given a token of its own, and no PAT may be introduced.
  for (const file of workflowFiles()) {
    const source = read(file);
    assert.equal(
      /secrets\.(?!GITHUB_TOKEN)[A-Z_]*TOKEN\b/.test(source),
      false,
      `${file} reads a token secret other than GITHUB_TOKEN`
    );
    assert.equal(/ghp_[A-Za-z0-9]/.test(source), false, `${file} contains a classic PAT`);
  }
});