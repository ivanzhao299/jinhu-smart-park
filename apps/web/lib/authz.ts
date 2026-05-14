import type { AuthUser, SystemPermissionCode } from "@jinhu/shared";
import { clearSession, getStoredUser, getToken, setSession } from "./auth";
import { hasPermission as can } from "./permissions";

export function getAccessToken(): string {
  return getToken();
}

export function getAuthUser(): AuthUser | null {
  const user = getStoredUser();
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    real_name: user.real_name,
    mobile: user.mobile,
    email: user.email,
    tenantId: user.tenant_id,
    parkId: user.park_id,
    tenant_id: user.tenant_id,
    park_id: user.park_id,
    org_id: user.org_id,
    org_name: user.org_name,
    roles: user.roles.map((role) => role.role_code),
    permissions: user.permissions,
    data_scope: user.data_scope,
    is_super: user.is_super
  };
}

export function setAuthSession(token: string, user: AuthUser): void {
  setSession(token, {
    id: user.id,
    username: user.username,
    real_name: user.realName ?? user.real_name ?? user.username,
    mobile: user.mobile ?? null,
    email: user.email ?? null,
    tenant_id: user.tenant_id ?? user.tenantId,
    park_id: user.park_id ?? user.parkId,
    org_id: user.org_id ?? null,
    org_name: user.org_name ?? null,
    roles: user.roles.map((role) => ({ role_code: role, role_name: role })),
    permissions: user.permissions,
    data_scope: user.data_scope ?? "tenant",
    is_super: user.is_super ?? user.roles.some((role) => role.toUpperCase() === "SUPER_ADMIN")
  });
}

export function hasPermission(user: AuthUser | null, permission: SystemPermissionCode): boolean {
  return can(user, permission);
}

export { clearSession };
