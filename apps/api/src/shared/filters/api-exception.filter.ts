import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { ClsService } from "nestjs-cls";
import {
  PROPERTY_ERROR_CODES,
  type ApiResponse,
  type PropertyErrorCode
} from "@jinhu/shared";

interface ErrorResponseBody {
  message?: string | string[];
  error?: string;
}

interface StructuredBusinessErrorData {
  errorCode: PropertyErrorCode;
  actionId?: string;
  targetId?: string;
  expectedVersion?: number;
  actualVersion?: number;
  latestVersion?: number;
  retryable?: boolean;
  recoveryAction?: string;
  approvalAvailable?: false;
  blockers?: string[];
  details?: Record<string, string | null>;
}

const PROPERTY_ERROR_CODE_SET = new Set<string>(PROPERTY_ERROR_CODES);
const ACTION_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const BLOCKER_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_RELATIVE_DEEP_LINK_PATTERN = /^\/[a-z0-9][a-z0-9/_-]*$/;
const SAFE_RESOURCE_MESSAGE = "Resource not available";
const GLOBAL_RECOVERY_ACTION_BY_ERROR_CODE = new Map<string, string>([
  ["property-version-conflict", "reload"],
  ["property-runtime-unavailable", "retry-with-same-client-key"],
  ["identity-snapshot-stale", "party.identity.update-draft"]
]);
const TASK_ERROR_RULES = new Map<string, {
  status: number;
  retryable: boolean;
  recoveryAction: string | null;
  latestVersionRequired?: true;
  detailKey?: "assigneeDisplay" | "deepLink";
}>([
  ["task-already-claimed", {
    status: 409,
    retryable: false,
    recoveryAction: "property.task.refresh",
    detailKey: "assigneeDisplay"
  }],
  ["task-source-ineligible", {
    status: 409,
    retryable: false,
    recoveryAction: "property.task.return-to-workspace",
    detailKey: "deepLink"
  }],
  ["task-version-conflict", {
    status: 409,
    retryable: true,
    recoveryAction: "property.task.reload",
    latestVersionRequired: true
  }],
  ["property-version-conflict", {
    status: 409,
    retryable: true,
    recoveryAction: "reload"
  }],
  ["property-runtime-unavailable", {
    status: 503,
    retryable: true,
    recoveryAction: "retry-with-same-client-key"
  }],
  ["property-action-forbidden", {
    status: 403,
    retryable: false,
    recoveryAction: null
  }],
  ["property-resource-not-found", {
    status: 404,
    retryable: false,
    recoveryAction: null
  }]
]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.resolveStatus(exception);
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const data = this.resolveStructuredBusinessErrorData(body, status);
    const message = this.isSafeResourceError(body, status)
      ? SAFE_RESOURCE_MESSAGE
      : this.isDatabaseConflict(exception)
      ? "Resource conflicts with an existing active record"
      : this.resolveMessage(body, exception);
    const payload: ApiResponse<StructuredBusinessErrorData | null> = {
      code: status,
      message,
      data,
      request_id: this.cls.getId() ?? "",
      server_time: Date.now()
    };
    response.status(status).json(payload);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return this.isDatabaseConflict(exception) ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private isDatabaseConflict(exception: unknown): boolean {
    if (!exception || typeof exception !== "object") return false;
    const value = exception as { code?: unknown; driverError?: { code?: unknown } };
    const code = value.code ?? value.driverError?.code;
    return code === "23P01";
  }

  private resolveMessage(body: string | object | undefined, exception: unknown): string {
    if (typeof body === "string") {
      return body;
    }
    if (this.isErrorBody(body)) {
      if (Array.isArray(body.message)) {
        return body.message.join("; ");
      }
      return body.message ?? body.error ?? "Request failed";
    }
    return exception instanceof Error ? exception.message : "Internal server error";
  }

  private isErrorBody(value: unknown): value is ErrorResponseBody {
    return typeof value === "object" && value !== null;
  }

  private resolveStructuredBusinessErrorData(
    value: unknown,
    status: number
  ): StructuredBusinessErrorData | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const body = value as Record<string, unknown>;

    if (
      typeof body.errorCode !== "string"
      || !PROPERTY_ERROR_CODE_SET.has(body.errorCode)
    ) {
      return null;
    }

    const taskRule = TASK_ERROR_RULES.get(body.errorCode);
    if (taskRule !== undefined) {
      return this.resolveTaskWireErrorData(body, status, taskRule);
    }

    const data: StructuredBusinessErrorData = {
      errorCode: body.errorCode as PropertyErrorCode
    };
    this.assignPatternString(data, "actionId", body.actionId, ACTION_ID_PATTERN);
    this.assignNonEmptyString(data, "targetId", body.targetId);
    this.assignSafeVersion(data, "expectedVersion", body.expectedVersion);
    this.assignSafeVersion(data, "actualVersion", body.actualVersion);
    this.assignSafeVersion(data, "latestVersion", body.latestVersion);
    if (typeof body.retryable === "boolean") data.retryable = body.retryable;
    this.assignGlobalRecoveryAction(data, body.errorCode, body.recoveryAction);
    if (body.approvalAvailable === false) data.approvalAvailable = false;
    if (
      Array.isArray(body.blockers)
      && body.blockers.every(
        (item) => typeof item === "string" && BLOCKER_CODE_PATTERN.test(item)
      )
    ) {
      data.blockers = [...body.blockers];
    }
    if (this.isPlainRecord(body.details)) {
      data.details = {};
    }

    return data;
  }

  private assignNonEmptyString<
    K extends "targetId"
  >(
    target: StructuredBusinessErrorData,
    key: K,
    value: unknown
  ): void {
    if (typeof value === "string" && value.length > 0 && value.length <= 256) {
      target[key] = value;
    }
  }

  private assignPatternString<
    K extends "actionId"
  >(
    target: StructuredBusinessErrorData,
    key: K,
    value: unknown,
    pattern: RegExp
  ): void {
    if (
      typeof value === "string"
      && value.length <= 128
      && pattern.test(value)
    ) {
      target[key] = value;
    }
  }

  private resolveTaskWireErrorData(
    body: Record<string, unknown>,
    status: number,
    rule: {
      status: number;
      retryable: boolean;
      recoveryAction: string | null;
      latestVersionRequired?: true;
      detailKey?: "assigneeDisplay" | "deepLink";
    }
  ): StructuredBusinessErrorData | null {
    if (
      status !== rule.status
      || body.retryable !== rule.retryable
      || !this.isPlainRecord(body.details)
    ) {
      return null;
    }
    if (
      rule.recoveryAction === null
        ? body.recoveryAction !== undefined
        : body.recoveryAction !== rule.recoveryAction
    ) {
      return null;
    }
    if (
      rule.latestVersionRequired
      && (!Number.isSafeInteger(body.latestVersion) || Number(body.latestVersion) <= 0)
    ) {
      return null;
    }

    const details = this.resolveRequiredTaskErrorDetails(rule.detailKey, body.details);
    if (details === null) return null;

    const data: StructuredBusinessErrorData = {
      errorCode: body.errorCode as PropertyErrorCode,
      retryable: rule.retryable,
      details
    };
    if (rule.recoveryAction !== null) data.recoveryAction = rule.recoveryAction;
    if (rule.latestVersionRequired) data.latestVersion = Number(body.latestVersion);
    return data;
  }

  private assignGlobalRecoveryAction(
    target: StructuredBusinessErrorData,
    errorCode: string,
    value: unknown
  ): void {
    const expected = GLOBAL_RECOVERY_ACTION_BY_ERROR_CODE.get(errorCode);
    if (expected !== undefined && value === expected) {
      target.recoveryAction = value;
    }
  }

  private resolveRequiredTaskErrorDetails(
    detailKey: "assigneeDisplay" | "deepLink" | undefined,
    value: Record<string, unknown>
  ): Record<string, string | null> | null {
    if (detailKey === "assigneeDisplay") {
      const assigneeDisplay = value.assigneeDisplay;
      if (assigneeDisplay === null) return { assigneeDisplay: null };
      if (this.isSafeAssigneeDisplay(assigneeDisplay)) {
        return { assigneeDisplay };
      }
      return null;
    }

    if (detailKey === "deepLink") {
      const deepLink = value.deepLink;
      if (deepLink === null) return { deepLink: null };
      if (this.isSafeRelativeDeepLink(deepLink)) return { deepLink };
      return null;
    }

    return {};
  }

  private isSafeResourceError(value: unknown, status: number): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const errorCode = (value as Record<string, unknown>).errorCode;
    return (
      (status === 403 && errorCode === "property-action-forbidden")
      || (status === 404 && errorCode === "property-resource-not-found")
    );
  }

  private isSafeAssigneeDisplay(value: unknown): value is string {
    return (
      typeof value === "string"
      && value.length > 0
      && value.length <= 128
      && value.trim() === value
      && !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
      })
      && !UUID_PATTERN.test(value)
    );
  }

  private isSafeRelativeDeepLink(value: unknown): value is string {
    return (
      typeof value === "string"
      && value.length > 0
      && value.length <= 512
      && SAFE_RELATIVE_DEEP_LINK_PATTERN.test(value)
      && !value.includes("//")
      && !value.split("/").some((segment) => segment === "." || segment === "..")
    );
  }

  private assignSafeVersion<
    K extends "expectedVersion" | "actualVersion" | "latestVersion"
  >(
    target: StructuredBusinessErrorData,
    key: K,
    value: unknown
  ): void {
    if (Number.isSafeInteger(value) && Number(value) >= 0) {
      target[key] = Number(value);
    }
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === "object"
      && value !== null
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype
    );
  }
}
