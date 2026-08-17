import type { TenantParkScope } from "@jinhu/shared";

export function activeTenantPermissionWhere(scope: TenantParkScope) {
  return {
    tenantId: scope.tenantId,
    status: "enabled",
    isEnabled: true,
    isDeleted: false
  };
}
