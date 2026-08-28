export const PROTECTED_TENANT_SUPER_ROLE_CODE = "SUPER_ADMIN";

export interface ProtectedTenantSuperRole {
  tenantId: string;
  code: string;
  roleScope: string;
  isSuper: boolean;
  isSystem: boolean;
  isBuiltin: boolean;
  isEnabled: boolean;
  status: string;
  isDeleted: boolean;
}

export interface ProtectedTenantSuperBinding {
  tenantId: string;
  isDeleted: boolean;
  role: ProtectedTenantSuperRole;
}

export function isProtectedTenantSuperRole(role: ProtectedTenantSuperRole): boolean {
  return role.code === PROTECTED_TENANT_SUPER_ROLE_CODE
    && role.roleScope === "platform"
    && role.isSuper === true
    && role.isSystem === true
    && role.isBuiltin === true
    && role.isEnabled === true
    && role.status === "enabled"
    && role.isDeleted === false;
}

export function isProtectedTenantSuperBinding(
  link: ProtectedTenantSuperBinding,
  tenantId: string
): boolean {
  return link.tenantId === tenantId
    && link.role.tenantId === tenantId
    && link.isDeleted === false
    && isProtectedTenantSuperRole(link.role);
}
