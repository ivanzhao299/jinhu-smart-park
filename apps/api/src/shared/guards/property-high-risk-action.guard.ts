import {
  ConflictException,
  Injectable,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { TRACK_A_HIGH_RISK_ACTION_IDS } from "@jinhu/shared";
import type { Request } from "express";
import {
  PROPERTY_HIGH_RISK_ACTION_KEY,
  isPropertyHighRiskActionMetadata
} from "../decorators/property-high-risk-action.decorator";
import {
  isPropertyWorkbenchV2Enabled
} from "../property-workbench/property-workbench-v2";

export const PROPERTY_APPROVAL_REQUIRED_MESSAGE =
  "PROPERTY_APPROVAL_REQUIRED: High-risk property action is disabled until approval enforcement is available";

const TRACK_A_HIGH_RISK_ACTION_ID_SET = new Set<string>(
  TRACK_A_HIGH_RISK_ACTION_IDS
);

const RAW_DECIMAL_PATTERN = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

type VariantPredicateResult = "match" | "no-match" | "invalid";

function evaluateAnyNonZeroValue(value: unknown): VariantPredicateResult {
  if (value === undefined) return "no-match";
  if (typeof value === "number") {
    return Object.is(value, 0) || Object.is(value, -0) ? "no-match" : "match";
  }
  if (typeof value !== "string") return "invalid";
  const decimal = value.trim();
  if (!RAW_DECIMAL_PATTERN.test(decimal)) return "invalid";
  return /^[+-]?0(?:\.0+)?$/u.test(decimal) ? "no-match" : "match";
}

function evaluateVariantPredicate(
  body: unknown,
  allEquals: Readonly<Record<string, string>>,
  anyNonZero: readonly string[]
): VariantPredicateResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "invalid";
  }
  const record = body as Record<string, unknown>;
  for (const [field, expected] of Object.entries(allEquals)) {
    const actual = record[field];
    if (typeof actual !== "string") return "invalid";
    if (actual !== expected) return "no-match";
  }
  let result: VariantPredicateResult = "no-match";
  for (const field of anyNonZero) {
    const fieldResult = evaluateAnyNonZeroValue(record[field]);
    if (fieldResult === "invalid") return "invalid";
    if (fieldResult === "match") result = "match";
  }
  return result;
}

@Injectable()
export class PropertyHighRiskActionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isPropertyWorkbenchV2Enabled(this.configService)) {
      return true;
    }

    const metadata =
      this.reflector.getAllAndOverride<unknown>(
        PROPERTY_HIGH_RISK_ACTION_KEY,
        [context.getHandler(), context.getClass()]
      );
    if (metadata === undefined) {
      return true;
    }

    if (
      !isPropertyHighRiskActionMetadata(metadata)
      || !TRACK_A_HIGH_RISK_ACTION_ID_SET.has(metadata.actionId)
    ) {
      throw new ConflictException(PROPERTY_APPROVAL_REQUIRED_MESSAGE);
    }

    if (metadata.discriminator) {
      const request = context.switchToHttp().getRequest<Request>();
      const body = request.body;
      const value =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)[metadata.discriminator.bodyField]
          : undefined;
      if (
        typeof value !== "string"
        || !metadata.discriminator.highRiskValues.includes(value)
      ) {
        return true;
      }
    }

    if (metadata.variantPredicate) {
      const request = context.switchToHttp().getRequest<Request>();
      const predicateResult = evaluateVariantPredicate(
        request.body,
        metadata.variantPredicate.allEquals,
        metadata.variantPredicate.anyNonZero
      );
      if (predicateResult === "no-match") return true;
    }

    throw new ConflictException(PROPERTY_APPROVAL_REQUIRED_MESSAGE);
  }
}
