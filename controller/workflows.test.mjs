import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

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

test('write permissions stay outside author, verifier and reviewer execution', () => {
  const engine = read(join(workflowsDir, 'ia-dev-engine.yml'));

  // The reusable engine starts read-only. Only trusted publication and failure/retry
  // reporting are allowed to request write scopes.
  assert.match(engine, /^permissions:\n {2}contents: read/m);

  for (const job of ['execute', 'verify', 'review']) {
    const start = engine.indexOf(`  ${job}:`);
    assert.ok(start >= 0, `missing ${job} job`);
    const rest = engine.slice(start + 2);
    const next = rest.search(/^ {2}[\w-]+:/m);
    const block = next >= 0 ? rest.slice(0, next) : rest;
    assert.doesNotMatch(block, /(contents|pull-requests|issues|statuses|actions): write/, `${job} must remain read-only`);
  }

  const publishStart = engine.indexOf('  publish:');
  const failureStart = engine.indexOf('  report-failure:');
  assert.ok(publishStart >= 0 && failureStart > publishStart, 'trusted write jobs must exist');
  const publishBlock = engine.slice(publishStart, failureStart);
  const failureBlock = engine.slice(failureStart);
  assert.match(publishBlock, /contents: write/);
  assert.match(publishBlock, /pull-requests: write/);
  assert.match(publishBlock, /issues: write/);
  assert.match(publishBlock, /statuses: write/);
  assert.match(failureBlock, /issues: write/);
  assert.match(failureBlock, /actions: write/);
});

test('a reusable-workflow caller may grant union permissions only as a code-free wrapper', () => {
  for (const file of workflowFiles()) {
    const source = read(file);
    const hasTopLevelWrite = /^permissions:\n(?: {2}[\w-]+: (?:read|write)\n)+/m.test(source) &&
      /^permissions:\n(?:(?: {2}[\w-]+: (?:read|write)\n))* {2}(?:contents|pull-requests|issues|statuses|actions): write/m.test(source);
    if (!hasTopLevelWrite) continue;

    assert.equal(basename(file), 'laboratory.yml', `${file} unexpectedly grants workflow-level writes`);
    assert.match(source, /uses: \.\/\.github\/workflows\/ia-dev-engine\.yml/);
    assert.doesNotMatch(source, /^ {6}steps:/m, 'the write-capable wrapper must not execute arbitrary steps');
    assert.doesNotMatch(source, /^ {6}runs-on:/m, 'the write-capable wrapper must delegate instead of running code');
  }
});

test('the engine test suite is wired into CI', () => {
  const ci = read(join(workflowsDir, 'ci.yml'));
  assert.match(ci, /npm run test:architecture/);
  assert.match(ci, /branches:\s*(\[main\]|\n\s*- main)/);
  assert.match(ci, /permissions:\s*\n {2}contents: read/);
});

test('no workflow reads a GitHub token from the repository target', () => {
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
