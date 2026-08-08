import {
  ConflictException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

export const PROPERTY_APPROVAL_REQUIRED_ACTION_KEY =
  "property_approval_required_action";

export type PropertyApprovalRequiredActionId =
  | "property.mode-transition.request"
  | "property.occupancy.force-release.request";

interface PropertyApprovalRequiredMetadata {
  actionId: PropertyApprovalRequiredActionId;
  variant: "always" | "force-release";
}

const APPROVAL_REQUIRED_ACTIONS =
  new Set<PropertyApprovalRequiredActionId>([
    "property.mode-transition.request",
    "property.occupancy.force-release.request"
  ]);

export const PropertyApprovalRequired = (
  metadata: PropertyApprovalRequiredMetadata
) => SetMetadata(PROPERTY_APPROVAL_REQUIRED_ACTION_KEY, metadata);

export function approvalRequiredConflict(
  actionId: PropertyApprovalRequiredActionId,
  targetId: string
): ConflictException {
  return new ConflictException({
    message: "approval-required",
    errorCode: "approval-required",
    actionId,
    targetId,
    approvalAvailable: false
  });
}

export function assertApprovalRequired(
  actionId: PropertyApprovalRequiredActionId,
  targetId: string
): never {
  throw approvalRequiredConflict(actionId, targetId);
}

function isExactMetadata(
  value: unknown
): value is PropertyApprovalRequiredMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "actionId,variant"
    || typeof record.actionId !== "string"
    || !APPROVAL_REQUIRED_ACTIONS.has(
      record.actionId as PropertyApprovalRequiredActionId
    )
  ) {
    return false;
  }
  return (
    record.actionId === "property.mode-transition.request"
      && record.variant === "always"
  ) || (
    record.actionId === "property.occupancy.force-release.request"
      && record.variant === "force-release"
  );
}

@Injectable()
export class PropertyApprovalRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<unknown>(
      PROPERTY_APPROVAL_REQUIRED_ACTION_KEY,
      [context.getHandler(), context.getClass()]
    );
    const request = context.switchToHttp().getRequest<Request>();
    const unitId = request.params?.unitId;
    const occupancyId = request.params?.id;
    const isModeTransitionRoute = typeof unitId === "string";
    const expected: PropertyApprovalRequiredMetadata =
      isModeTransitionRoute
        ? {
            actionId: "property.mode-transition.request",
            variant: "always"
          }
        : {
            actionId: "property.occupancy.force-release.request",
            variant: "force-release"
          };
    const targetId = typeof unitId === "string"
      ? unitId
      : typeof occupancyId === "string"
        ? occupancyId
        : "";

    if (
      !isExactMetadata(metadata)
      || metadata.actionId !== expected.actionId
      || metadata.variant !== expected.variant
    ) {
      throw approvalRequiredConflict(expected.actionId, targetId);
    }

    if (metadata.variant === "force-release") {
      const force =
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>).force
          : undefined;
      if (force !== true && force !== "true") return true;
    }

    throw approvalRequiredConflict(metadata.actionId, targetId);
  }
}
