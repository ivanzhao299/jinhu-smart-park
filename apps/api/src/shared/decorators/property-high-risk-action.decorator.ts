import { SetMetadata } from "@nestjs/common";
import { TRACK_A_HIGH_RISK_ACTION_IDS } from "@jinhu/shared";

export const PROPERTY_HIGH_RISK_ACTION_KEY = "property_high_risk_action";

export type PropertyHighRiskActionId =
  (typeof TRACK_A_HIGH_RISK_ACTION_IDS)[number];

export interface PropertyHighRiskActionDiscriminator {
  bodyField: "entry_type";
  highRiskValues: readonly string[];
}

export interface PropertyHighRiskActionMetadata {
  actionId: PropertyHighRiskActionId;
  discriminator?: PropertyHighRiskActionDiscriminator;
}

const PROPERTY_HIGH_RISK_ACTION_IDS = new Set<string>(
  TRACK_A_HIGH_RISK_ACTION_IDS
);

const EXPECTED_DISCRIMINATORS: Partial<
  Record<PropertyHighRiskActionId, PropertyHighRiskActionDiscriminator>
> = {
  "homestay.finance.refund-or-waive": {
    bodyField: "entry_type",
    highRiskValues: ["refund", "waiver"]
  },
  "housing.finance.refund-waive-or-deposit-refund": {
    bodyField: "entry_type",
    highRiskValues: ["refund", "waiver", "deposit_refund"]
  }
};

function hasExactValues(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function isPropertyHighRiskActionMetadata(
  value: unknown
): value is PropertyHighRiskActionMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    actionId?: unknown;
    discriminator?: {
      bodyField?: unknown;
      highRiskValues?: unknown;
    };
  };
  if (
    typeof candidate.actionId !== "string"
    || !PROPERTY_HIGH_RISK_ACTION_IDS.has(candidate.actionId)
  ) {
    return false;
  }

  const actionId = candidate.actionId as PropertyHighRiskActionId;
  const expected = EXPECTED_DISCRIMINATORS[actionId];
  if (!expected) return candidate.discriminator === undefined;
  const actual = candidate.discriminator;
  return actual?.bodyField === expected.bodyField
    && Array.isArray(actual.highRiskValues)
    && actual.highRiskValues.every((item) => typeof item === "string")
    && hasExactValues(actual.highRiskValues, expected.highRiskValues);
}

export const PropertyHighRiskAction = (
  actionId: PropertyHighRiskActionId,
  discriminator?: PropertyHighRiskActionDiscriminator
) => {
  const metadata = {
    actionId,
    ...(discriminator ? { discriminator } : {})
  } satisfies PropertyHighRiskActionMetadata;
  if (!isPropertyHighRiskActionMetadata(metadata)) {
    throw new Error(`Invalid high-risk property action metadata: ${actionId}`);
  }
  return SetMetadata(PROPERTY_HIGH_RISK_ACTION_KEY, metadata);
};
