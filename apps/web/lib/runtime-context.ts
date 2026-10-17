import type { UserContext } from "@jinhu/shared";
import { formatParkRoleSummary } from "./park-role-summary";

export function isEnterpriseRuntime(user: Pick<UserContext, "runtime_mode"> | null | undefined): boolean {
  return user?.runtime_mode === "hr_enterprise";
}

export function contextNoun(user: Pick<UserContext, "runtime_mode"> | null | undefined): string {
  return isEnterpriseRuntime(user) ? "企业" : "园区";
}

export function accessibleContextOptions(user: UserContext | null): Array<{ value: string; label: string }> {
  if (isEnterpriseRuntime(user)) {
    return (user?.accessible_enterprises ?? []).map((enterprise) => ({
      value: enterprise.scope_key,
      label: `${enterprise.enterprise_code ? `${enterprise.enterprise_code} · ` : ""}${enterprise.enterprise_name}`
    }));
  }
  return (user?.accessible_parks ?? []).filter((park) => park.status === "enabled").map((park) => ({
    value: park.park_id,
    label: `${park.park_code ? `${park.park_code} · ` : ""}${park.park_name}｜${formatParkRoleSummary(park.role_summary, "未配置园区角色") ?? "角色摘要不可见"}`
  }));
}

export function currentContextLabel(user: UserContext | null): string {
  if (isEnterpriseRuntime(user)) return user?.current_enterprise?.enterprise_name ?? "当前企业";
  return user?.current_park?.park_name ?? user?.park_name ?? "当前园区";
}

export function operationScopeKey(user: UserContext | null): string {
  return JSON.stringify([user?.id, user?.tenant_id, user?.park_id, user?.runtime_mode,
    [...(user?.permissions ?? [])].sort(), user?.enabled_modules, user?.data_scope,
    user?.data_scopes, user?.field_permissions, user?.field_policies]);
}
