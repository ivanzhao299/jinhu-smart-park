import { IDENTITY_SUBMISSION_STATUSES } from "@jinhu/shared";

export const IDENTITY_STATUS_OPTIONS = [...IDENTITY_SUBMISSION_STATUSES];

export function identityMutationValidationMessage(
  action: string,
  decision: "verified" | "rejected",
  reason: string
): string | null {
  if (action === "party.identity.verify" && decision === "rejected" && !reason.trim()) {
    return "拒绝核验时请填写原因。";
  }
  if (["party.identity.reassign", "party.identity.withdraw"].includes(action) && !reason.trim()) {
    return "请填写操作原因。";
  }
  return null;
}

export function safePropertyDeepLink(value: string): string | null {
  const normalized = value.trim();
  return normalized.startsWith("/") && !normalized.startsWith("//") ? normalized : null;
}
