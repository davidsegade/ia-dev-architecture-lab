import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadConfig, policyFor, tasksForPolicy } from './config.mjs';
import { requestFromIssue } from './tasks.mjs';
import { profiles } from './profiles.mjs';

const CONFIG = join(fileURLToPath(new URL('..', import.meta.url)), 'config/repositories.yml');

function policies() {
  const previous = process.env.CONFIG_PATH;
  process.env.CONFIG_PATH = CONFIG;
  try { return loadConfig(); }
  finally {
    if (previous === undefined) delete process.env.CONFIG_PATH;
    else process.env.CONFIG_PATH = previous;
  }
}

test('legacy and ranked synthetic use identical task semantics and retry budgets', () => {
  const catalog = { chunk: 'same chunk specification' };
  const legacy = requestFromIssue('task: chunk', {
    taskCatalog: catalog,
    allowedProfiles: ['legacy-synthetic', 'ranked-synthetic']
  });
  const ranked = requestFromIssue('profile: ranked-synthetic\ntask: chunk', {
    taskCatalog: catalog,
    allowedProfiles: ['legacy-synthetic', 'ranked-synthetic']
  });
  assert.equal(legacy.task, 'chunk');
  assert.equal(ranked.task, 'chunk');
  assert.equal(legacy.specification, ranked.specification);
  assert.equal(profiles[legacy.profile].contextMode, 'legacy');
  assert.equal(profiles[ranked.profile].contextMode, 'ranked-context');
  assert.equal(profiles[legacy.profile].authorAttempts, profiles[ranked.profile].authorAttempts);
  assert.equal(profiles[legacy.profile].reviewerAttempts, profiles[ranked.profile].reviewerAttempts);
});

test('architecture lab alone enables ranked synthetic measurement', () => {
  const repositories = policies();
  const lab = policyFor('davidsegade/ia-dev-architecture-lab', repositories);
  const turneo = policyFor('davidsegade/TURNEO-Flutter', repositories);
  assert.ok(lab.profiles.includes('ranked-synthetic'));
  assert.equal(turneo.profiles.includes('ranked-synthetic'), false);
  assert.ok(tasksForPolicy(lab).chunk);
});

test('ranked synthetic cannot turn a free-form goal into a task', () => {
  assert.throws(
    () => requestFromIssue('profile: ranked-synthetic\ngoal: arbitrary change', {
      taskCatalog: { chunk: 'chunk spec' },
      allowedProfiles: ['ranked-synthetic']
    }),
    /registered synthetic task is required/
  );
});
