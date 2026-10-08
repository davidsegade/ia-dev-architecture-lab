export function displayName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}
