import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextModeForRole, profileFor, profiles } from './profiles.mjs';

test('engine owns the supported request profiles and their limits', () => {
  assert.deepEqual(Object.keys(profiles).sort(), ['code-change', 'legacy-synthetic', 'ranked-synthetic']);
  assert.equal(profiles['legacy-synthetic'].kind, 'registered-task');
  assert.equal(profiles['legacy-synthetic'].contextMode, 'legacy');
  assert.equal(profiles['legacy-synthetic'].authorContextMode, 'legacy');
  assert.equal(profiles['legacy-synthetic'].reviewerContextMode, 'legacy');
  assert.equal(profiles['ranked-synthetic'].kind, 'registered-task');
  assert.equal(profiles['ranked-synthetic'].contextMode, 'ranked-context');
  assert.equal(profiles['ranked-synthetic'].authorContextMode, 'ranked-context');
  assert.equal(profiles['ranked-synthetic'].reviewerContextMode, 'review-diff');
  assert.equal(profiles['code-change'].kind, 'goal');
  assert.equal(profiles['code-change'].contextMode, 'ranked-context');
  assert.equal(profiles['code-change'].authorContextMode, 'ranked-context');
  assert.equal(profiles['code-change'].reviewerContextMode, 'review-diff');
  assert.equal(profiles['code-change'].maxGoalChars, 4000);
  assert.equal(profiles['legacy-synthetic'].authorAttempts, profiles['ranked-synthetic'].authorAttempts);
  assert.equal(profiles['legacy-synthetic'].reviewerAttempts, profiles['ranked-synthetic'].reviewerAttempts);
});

test('ranked profiles use structural context for author and diff-focused context for reviewer', () => {
  const ranked = profiles['ranked-synthetic'];
  assert.equal(contextModeForRole(ranked, 'write'), 'ranked-context');
  assert.equal(contextModeForRole(ranked, 'review'), 'review-diff');
  assert.equal(contextModeForRole(profiles['code-change'], 'write'), 'ranked-context');
  assert.equal(contextModeForRole(profiles['code-change'], 'review'), 'review-diff');
  assert.equal(contextModeForRole(profiles['legacy-synthetic'], 'review'), 'legacy');
  assert.throws(() => contextModeForRole(ranked, 'merge'), /Unsupported execution role/);
});

test('repository policy can narrow but never invent profiles', () => {
  assert.equal(profileFor('legacy-synthetic', ['legacy-synthetic']).kind, 'registered-task');
  assert.throws(() => profileFor('ranked-synthetic', ['legacy-synthetic']), /not allowed/);
  assert.throws(() => profileFor('code-change', ['legacy-synthetic']), /not allowed/);
  assert.throws(() => profileFor('invented', ['invented']), /Unknown engine profile/);
});
