import type { EngineeringAcceptanceStatus } from "./engineering-acceptances-types";

export function isAcceptanceEditable(status: EngineeringAcceptanceStatus): boolean {
  return status === "DRAFT" || status === "FAILED" || status === "RECTIFICATION_REQUIRED";
}

export function isAcceptanceSubmittable(status: EngineeringAcceptanceStatus): boolean {
  return status === "DRAFT" || status === "FAILED" || status === "RECTIFICATION_REQUIRED";
}

export function isAcceptanceReviewable(status: EngineeringAcceptanceStatus): boolean {
  return status === "SUBMITTED" || status === "REVIEWING";
}

export function isAcceptanceClosable(status: EngineeringAcceptanceStatus): boolean {
  return status === "PASSED" || status === "FAILED" || status === "RECTIFICATION_REQUIRED";
}

export function isAcceptanceDeletable(status: EngineeringAcceptanceStatus): boolean {
  return status === "DRAFT";
}

export function validateAcceptanceName(value: string): string {
  if (!value.trim()) return "请填写验收名称";
  return "";
}
