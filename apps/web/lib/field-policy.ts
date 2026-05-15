import type { FieldPolicyContext, UserContext } from "@jinhu/shared";

function findPolicy(user: UserContext | null, moduleName: string, entityName: string, fieldKey: string): FieldPolicyContext | undefined {
  return user?.field_policies?.find((policy) => policy.module === moduleName && policy.entity === entityName && policy.field_key === fieldKey);
}

export function canViewField(user: UserContext | null, moduleName: string, entityName: string, fieldKey: string): boolean {
  if (user?.is_super) {
    return true;
  }
  return findPolicy(user, moduleName, entityName, fieldKey)?.policy_type !== "hidden";
}

export function canEditField(user: UserContext | null, moduleName: string, entityName: string, fieldKey: string): boolean {
  if (user?.is_super) {
    return true;
  }
  const policy = findPolicy(user, moduleName, entityName, fieldKey);
  return policy ? policy.policy_type === "editable" : true;
}

export function maskField(user: UserContext | null, moduleName: string, entityName: string, fieldKey: string, value: unknown): unknown {
  const policy = findPolicy(user, moduleName, entityName, fieldKey);
  if (!policy || user?.is_super) {
    return value;
  }
  if (policy.policy_type === "hidden") {
    return "";
  }
  if (policy.policy_type !== "masked") {
    return value;
  }
  return maskValue(value, policy.mask_rule);
}

function maskValue(value: unknown, maskRule?: string | null): unknown {
  if (value === null || value === undefined) return value;
  const raw = String(value);
  if (!raw) return raw;
  switch (maskRule) {
    case "mobile":
      return raw.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
    case "id_card":
      return raw.length <= 8 ? "****" : `${raw.slice(0, 4)}********${raw.slice(-4)}`;
    case "bank_account":
      return raw.length <= 8 ? "****" : `${raw.slice(0, 4)} **** **** ${raw.slice(-4)}`;
    case "amount":
      return "***";
    case "custom":
      return raw.length <= 4 ? "****" : `${raw.slice(0, 2)}***${raw.slice(-2)}`;
    case "file_name":
      return raw.replace(/(.{2}).*(\.[^.]+)$/u, "$1***$2");
    default:
      return raw.length <= 2 ? "*" : `${raw.slice(0, 1)}***${raw.slice(-1)}`;
  }
}
