import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  PROPERTY_TASK_ERROR_GOLDEN,
  type PropertyErrorCode
} from "@jinhu/shared";

type TaskWireErrorCode = keyof typeof PROPERTY_TASK_ERROR_GOLDEN;

export function propertyTaskError(
  errorCode: TaskWireErrorCode,
  details: Record<string, unknown> = {},
  latestVersion?: number
) {
  const rule = PROPERTY_TASK_ERROR_GOLDEN[errorCode];
  const body: Record<string, unknown> = {
    message: errorCode,
    errorCode,
    retryable: rule.retryable,
    details: selectSafeDetails(errorCode, details)
  };
  if (rule.recoveryAction !== null) body.recoveryAction = rule.recoveryAction;
  if ("latestVersion" in rule) body.latestVersion = latestVersion;
  if (rule.status === 403) return new ForbiddenException(body);
  if (rule.status === 404) return new NotFoundException(body);
  if (rule.status === 503) return new ServiceUnavailableException(body);
  return new ConflictException(body);
}

function selectSafeDetails(
  errorCode: TaskWireErrorCode,
  details: Record<string, unknown>
): Record<string, unknown> {
  if (errorCode === "task-already-claimed") {
    return typeof details.assigneeDisplay === "string"
      ? { assigneeDisplay: details.assigneeDisplay }
      : { assigneeDisplay: null };
  }
  if (errorCode === "task-source-ineligible") {
    return typeof details.deepLink === "string"
      && /^\/[a-z0-9][a-z0-9/_-]*$/.test(details.deepLink)
      ? { deepLink: details.deepLink }
      : { deepLink: null };
  }
  return {};
}

export function translatePropertyTaskDatabaseError(error: unknown): never {
  const value = error as {
    code?: string;
    message?: string;
    driverError?: { code?: string; message?: string };
  };
  const code = value.code ?? value.driverError?.code;
  const message = value.message ?? value.driverError?.message ?? "";
  if (message.includes("property-task-projection-version-conflict")) {
    throw propertyTaskError("task-version-conflict");
  }
  if (message.includes("property-task-projection") || code === "40001" || code === "40P01") {
    throw propertyTaskError("property-version-conflict");
  }
  if (code === "23505") throw propertyTaskError("task-version-conflict");
  if (code === "P0002") throw propertyTaskError("property-resource-not-found");
  throw error;
}

export function isPropertyTaskErrorCode(value: string): value is PropertyErrorCode {
  return value in PROPERTY_TASK_ERROR_GOLDEN;
}
