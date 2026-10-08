import { permissionsForRole } from './roles.mjs';

export function hasPermission(user, permission) {
  return permissionsForRole(user.role).includes(permission);
}
