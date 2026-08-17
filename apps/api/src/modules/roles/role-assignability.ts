import type { TenantParkScope } from "@jinhu/shared";
import type { RoleEntity } from "./entities/role.entity";

export type RoleUnassignableReason =
  | "deleted"
  | "disabled"
  | "template"
  | "system"
  | "builtin"
  | "platform"
  | "cross_scope";

export interface RoleAssignability {
  isAssignable: boolean;
  isProtected: boolean;
  unassignableReasons: RoleUnassignableReason[];
  assignabilityLabel: string;
}

const reasonLabels: Record<RoleUnassignableReason, string> = {
  deleted: "已删除",
  disabled: "已停用",
  template: "模板角色",
  system: "系统角色",
  builtin: "内置角色",
  platform: "平台角色",
  cross_scope: "不属于当前目标园区"
};

export function evaluateRoleAssignability(role: RoleEntity, targetScope: TenantParkScope): RoleAssignability {
  const reasons: RoleUnassignableReason[] = [];
  if (role.isDeleted) reasons.push("deleted");
  if (!role.isEnabled || role.status !== "enabled") reasons.push("disabled");
  if (role.isTemplate) reasons.push("template");
  if (role.isSystem) reasons.push("system");
  if (role.isBuiltin) reasons.push("builtin");
  if (role.roleScope === "platform") reasons.push("platform");
  if (
    role.tenantId !== targetScope.tenantId
    || (role.roleScope === "park" && role.parkId !== targetScope.parkId)
    || (role.roleScope !== "tenant" && role.roleScope !== "park" && role.roleScope !== "platform")
  ) {
    reasons.push("cross_scope");
  }

  return {
    isAssignable: reasons.length === 0,
    isProtected: isRoleAssignmentProtected(role),
    unassignableReasons: [...new Set(reasons)],
    assignabilityLabel: reasons.length === 0 ? "可分配" : [...new Set(reasons)].map((reason) => reasonLabels[reason]).join("、")
  };
}

export function isRoleAssignmentProtected(role: RoleEntity): boolean {
  return role.isTemplate || role.isSystem || role.isBuiltin || role.roleScope === "platform";
}
