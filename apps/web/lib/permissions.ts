interface PermissionSubject {
  permissions: string[];
  is_super?: boolean;
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
