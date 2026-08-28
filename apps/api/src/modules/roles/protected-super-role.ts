export const PROTECTED_TENANT_SUPER_ROLE_CODE = "SUPER_ADMIN";

export interface ProtectedTenantSuperRole {
  code: string;
  roleScope: string;
  isSuper: boolean;
  isSystem: boolean;
  isBuiltin: boolean;
  isEnabled: boolean;
  status: string;
  isDeleted: boolean;
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
