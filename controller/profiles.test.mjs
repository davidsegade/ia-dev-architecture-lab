import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileFor, profiles } from './profiles.mjs';

test('engine owns the supported request profiles and their limits', () => {
  assert.deepEqual(Object.keys(profiles).sort(), ['code-change', 'legacy-synthetic', 'ranked-synthetic']);
  assert.equal(profiles['legacy-synthetic'].kind, 'registered-task');
  assert.equal(profiles['legacy-synthetic'].contextMode, 'legacy');
  assert.equal(profiles['ranked-synthetic'].kind, 'registered-task');
  assert.equal(profiles['ranked-synthetic'].contextMode, 'ranked-context');
  assert.equal(profiles['code-change'].kind, 'goal');
  assert.equal(profiles['code-change'].contextMode, 'ranked-context');
  assert.equal(profiles['code-change'].maxGoalChars, 4000);
  assert.equal(profiles['legacy-synthetic'].authorAttempts, profiles['ranked-synthetic'].authorAttempts);
  assert.equal(profiles['legacy-synthetic'].reviewerAttempts, profiles['ranked-synthetic'].reviewerAttempts);
});

test('repository policy can narrow but never invent profiles', () => {
  assert.equal(profileFor('legacy-synthetic', ['legacy-synthetic']).kind, 'registered-task');
  assert.throws(() => profileFor('ranked-synthetic', ['legacy-synthetic']), /not allowed/);
  assert.throws(() => profileFor('code-change', ['legacy-synthetic']), /not allowed/);
  assert.throws(() => profileFor('invented', ['invented']), /Unknown engine profile/);
});
