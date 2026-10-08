export const profiles = Object.freeze({
  'legacy-synthetic': Object.freeze({
    kind: 'registered-task',
    authorAttempts: 2,
    reviewerAttempts: 1,
    maxGoalChars: 0
  }),
  'code-change': Object.freeze({
    kind: 'goal',
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
