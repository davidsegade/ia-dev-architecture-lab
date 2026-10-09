export const profiles = Object.freeze({
  'legacy-synthetic': Object.freeze({
    kind: 'registered-task',
    contextMode: 'legacy',
    authorContextMode: 'legacy',
    reviewerContextMode: 'legacy',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 0
  }),
  'ranked-synthetic': Object.freeze({
    kind: 'registered-task',
    contextMode: 'ranked-context',
    authorContextMode: 'ranked-context',
    reviewerContextMode: 'review-diff',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 0
  }),
  'legacy-review-diff-synthetic': Object.freeze({
    kind: 'registered-task',
    contextMode: 'legacy',
    authorContextMode: 'legacy',
    reviewerContextMode: 'review-diff',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 0
  }),
  'code-change': Object.freeze({
    kind: 'goal',
    contextMode: 'ranked-context',
    authorContextMode: 'ranked-context',
    reviewerContextMode: 'review-diff',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 4000
  })
});

export function profileFor(name, allowedProfiles = Object.keys(profiles)) {
  if (!allowedProfiles.includes(name)) {
    throw new Error(`Profile ${name} not allowed for this repository. Allowed profiles: ${allowedProfiles.join(', ')}`);
  }
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown engine profile: ${name}`);
  return profile;
}

export function contextModeForRole(profile, mode) {
  if (mode === 'write') return profile.authorContextMode || profile.contextMode;
  if (mode === 'review') return profile.reviewerContextMode || profile.contextMode;
  throw new Error(`Unsupported execution role: ${mode}`);
}
