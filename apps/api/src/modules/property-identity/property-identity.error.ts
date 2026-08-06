import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import type { PropertyErrorCode } from "@jinhu/shared";

export function propertyIdentityError(
  code: PropertyErrorCode,
  details: Record<string, unknown> = {}
) {
  const body = {
    message: code,
    errorCode: code,
    retryable: code === "property-runtime-unavailable",
    details
  };
  if (code === "property-validation-failed") return new BadRequestException(body);
  if (code === "property-action-forbidden") return new ForbiddenException(body);
  if (code === "property-resource-not-found") return new NotFoundException(body);
  if (code === "property-runtime-unavailable") return new ServiceUnavailableException(body);
  return new ConflictException(body);
}

export function translateIdentityDatabaseError(error: unknown): never {
  const value = error as {
    code?: string;
    message?: string;
    driverError?: { code?: string; message?: string };
  };
  const code = value.code ?? value.driverError?.code;
  const message = value.message ?? value.driverError?.message ?? "";
  const known = [
    "property-resource-not-found",
    "property-version-conflict",
    "identity-active-submission-exists",
    "identity-snapshot-stale",
    "identity-file-not-ready",
    "identity-actor-separation-required"
  ] as const;
  const token = known.find((candidate) => message.includes(candidate));
  if (token) throw propertyIdentityError(token);
  if (code === "P0002") throw propertyIdentityError("property-resource-not-found");
  if (code === "40001" || code === "23505") {
    throw propertyIdentityError("property-version-conflict");
  }
  if (code === "23514") throw propertyIdentityError("property-validation-failed");
  throw error;
}
