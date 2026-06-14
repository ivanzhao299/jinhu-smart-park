interface ModuleSubject {
  module_code?: string;
  moduleCode?: string;
  enabled?: boolean;
}

interface PermissionSubject {
  permissions?: string[];
  is_super?: boolean;
  isSuper?: boolean;
  enabled_modules?: ModuleSubject[];
  enabledModules?: ModuleSubject[];
}

function isSuperUser(user: PermissionSubject): boolean {
  return user.is_super === true || user.isSuper === true || (user.permissions ?? []).includes("*");
}

export function hasPermission(user: PermissionSubject | null, permission?: string): boolean {
  if (!permission) {
    return true;
  }
  if (!user) {
    return false;
  }
  const permissions = user.permissions ?? [];
  return isSuperUser(user) || permissions.includes(permission);
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
  if (isSuperUser(user)) {
    return true;
  }
  const modules = user.enabled_modules ?? user.enabledModules ?? [];
  return modules.some((module) => (module.module_code ?? module.moduleCode) === moduleCode && module.enabled !== false);
}

export function hasAccess(user: PermissionSubject | null, permission?: string, moduleCode?: string): boolean {
  return hasPermission(user, permission) && hasModule(user, moduleCode);
}
