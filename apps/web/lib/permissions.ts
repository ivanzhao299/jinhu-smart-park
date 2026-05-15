interface PermissionSubject {
  permissions: string[];
  is_super?: boolean;
  enabled_modules?: Array<{ module_code: string; enabled?: boolean }>;
}

export function hasPermission(user: PermissionSubject | null, permission?: string): boolean {
  if (!permission) {
    return true;
  }
  if (!user) {
    return false;
  }
  return user.is_super || user.permissions.includes("*") || user.permissions.includes(permission);
}

export function hasAnyPermission(user: PermissionSubject | null, permissions: string[]): boolean {
  if (permissions.length === 0) {
    return true;
  }
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasModule(user: PermissionSubject | null, moduleCode?: string): boolean {
  if (!moduleCode) {
    return true;
  }
  if (!user) {
    return false;
  }
  if (user.is_super || user.permissions.includes("*")) {
    return true;
  }
  return user.enabled_modules?.some((module) => module.module_code === moduleCode && module.enabled !== false) ?? false;
}

export function hasAccess(user: PermissionSubject | null, permission?: string, moduleCode?: string): boolean {
  return hasPermission(user, permission) && hasModule(user, moduleCode);
}
