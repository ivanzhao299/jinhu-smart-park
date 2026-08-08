import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import type { PropertyErrorCode } from "@jinhu/shared";

export function propertyApprovalError(
  code: PropertyErrorCode,
  details: Record<string, unknown> = {}
) {
  const body = {
    message: code,
    errorCode: code,
    retryable:
      code === "property-runtime-unavailable"
      || code === "approval-execution-failed",
    details
  };
  if (code === "property-validation-failed") return new BadRequestException(body);
  if (
    code === "property-action-forbidden"
    || code === "approval-actor-separation-required"
    || code === "approval-withdraw-forbidden"
  ) return new ForbiddenException(body);
  if (code === "property-resource-not-found") return new NotFoundException(body);
  if (code === "property-runtime-unavailable") return new ServiceUnavailableException(body);
  return new ConflictException(body);
}

export function translateApprovalDatabaseError(error: unknown): never {
  const value = error as {
    code?: string;
    message?: string;
    constraint?: string;
    driverError?: { code?: string; message?: string; constraint?: string };
  };
  const databaseCode = value.code ?? value.driverError?.code;
  const message = value.message ?? value.driverError?.message ?? "";
  const constraint = value.constraint ?? value.driverError?.constraint ?? "";
  const known = [
    "property-version-conflict",
    "idempotency-key-conflict",
    "approval-source-changed",
    "approval-actor-separation-required",
    "approval-already-decided",
    "approval-withdraw-forbidden",
    "approval-reconcile-partial"
  ] as const;
  const matched = known.find((candidate) => message.includes(candidate));
  if (matched) throw propertyApprovalError(matched);
  if (databaseCode === "P0002") throw propertyApprovalError("property-resource-not-found");
  if (databaseCode === "40001" || databaseCode === "40P01") {
    throw propertyApprovalError("property-version-conflict");
  }
  if (databaseCode === "23505") {
    if (constraint.includes("approval_decision_actor")) {
      throw propertyApprovalError("approval-actor-separation-required");
    }
    if (
      constraint.includes("effect_receipt")
      || constraint.includes("effect_manifest")
      || constraint.includes("outbox")
    ) throw propertyApprovalError("approval-reconcile-partial");
    if (
      constraint.includes("client")
      || constraint.includes("intent")
      || constraint.includes("mutation_receipt")
    ) throw propertyApprovalError("idempotency-key-conflict");
    throw propertyApprovalError("property-version-conflict");
  }
  if (databaseCode === "23503") throw propertyApprovalError("approval-source-changed");
  if (databaseCode === "23514") throw propertyApprovalError("property-validation-failed");
  throw error;
}
