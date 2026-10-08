export const ROLE_PERMISSIONS = Object.freeze({ viewer: ['read'], editor: ['read', 'write'], admin: ['read', 'write', 'admin'] });

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}
