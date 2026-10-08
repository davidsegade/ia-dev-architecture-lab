import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFor, loadModelRegistry, parseAvailableModels, selectCandidates, validateModelRegistry } from './models.mjs';

const registry = () => ({
  provider: 'opencode',
  author: [
    { id: 'opencode/a-free', cost: 0 },
    { id: 'opencode/b-free', cost: 0 }
  ],
  reviewer: [
    { id: 'opencode/r-free', cost: 0 }
  ]
});

test('the checked-in registry contains only zero-cost disjoint pools', () => {
  const actual = loadModelRegistry();
  const author = new Set(actual.author.map(entry => entry.id));
  const reviewer = new Set(actual.reviewer.map(entry => entry.id));
  assert.ok(actual.author.length >= 1);
  assert.ok(actual.reviewer.length >= 1);
  for (const entry of [...actual.author, ...actual.reviewer]) assert.equal(entry.cost, 0);
  for (const id of author) assert.equal(reviewer.has(id), false, `${id} appears in both roles`);
});

test('non-zero-cost entries fail closed even when their name says free', () => {
  const bad = registry();
  bad.author[0].cost = 0.001;
  assert.throws(() => validateModelRegistry(bad), /Non-zero-cost model forbidden/);
});

test('malformed provider model ids fail closed', () => {
  const bad = registry();
  bad.author[0].id = 'anthropic/paid';
  assert.throws(() => validateModelRegistry(bad), /Invalid author model id/);
});

test('author and reviewer pools must be disjoint', () => {
  const bad = registry();
  bad.reviewer[0].id = 'opencode/a-free';
  assert.throws(() => validateModelRegistry(bad), /must be disjoint/);
});

test('runtime discovery parses only valid opencode model ids', () => {
  assert.deepEqual(parseAvailableModels('opencode/b-free\nnoise\nopencode/a-free\nopencode/a-free\nanthropic/x\n'), [
    'opencode/b-free', 'opencode/a-free'
  ]);
});

test('candidate routing intersects availability with the approved registry', () => {
  const available = ['opencode/unapproved-free', 'opencode/b-free', 'opencode/r-free'];
  assert.deepEqual(candidatesFor('author', available, registry()), ['opencode/b-free']);
  assert.deepEqual(candidatesFor('reviewer', available, registry()), ['opencode/r-free']);
});

test('registry priority makes selection deterministic', () => {
  assert.deepEqual(candidatesFor('author', ['opencode/b-free', 'opencode/a-free'], registry()), [
    'opencode/a-free', 'opencode/b-free'
  ]);
});

test('a model merely named free is never accepted unless registered', () => {
  assert.deepEqual(candidatesFor('author', ['opencode/surprise-free'], registry()), []);
});

test('no available approved model fails closed', () => {
  assert.throws(() => selectCandidates('author', ['opencode/unapproved-free'], registry()), /No approved zero-cost author model/);
});

test('unknown role fails closed', () => {
  assert.throws(() => candidatesFor('merger', ['opencode/a-free'], registry()), /Unknown model role/);
});
