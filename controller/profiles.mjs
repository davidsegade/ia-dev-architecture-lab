export const profiles = Object.freeze({
  'legacy-synthetic': Object.freeze({
    kind: 'registered-task',
    contextMode: 'legacy',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 0
  }),
  'ranked-synthetic': Object.freeze({
    kind: 'registered-task',
    contextMode: 'ranked-context',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 0
  }),
  'code-change': Object.freeze({
    kind: 'goal',
    contextMode: 'ranked-context',
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
