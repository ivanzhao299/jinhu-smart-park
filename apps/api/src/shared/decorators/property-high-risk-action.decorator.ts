import { SetMetadata } from "@nestjs/common";
import { TRACK_A_HIGH_RISK_ACTION_IDS } from "@jinhu/shared";

export const PROPERTY_HIGH_RISK_ACTION_KEY = "property_high_risk_action";

export type PropertyHighRiskActionId =
  (typeof TRACK_A_HIGH_RISK_ACTION_IDS)[number];

export interface PropertyHighRiskActionDiscriminator {
  bodyField: "entry_type";
  highRiskValues: readonly string[];
}

export interface PropertyHighRiskActionVariantPredicate {
  allEquals: Readonly<Record<string, string>>;
  anyNonZero: readonly string[];
}

export interface PropertyHighRiskActionVariantOptions {
  variantPredicate: PropertyHighRiskActionVariantPredicate;
}

export interface PropertyHighRiskActionMetadata {
  actionId: PropertyHighRiskActionId;
  discriminator?: PropertyHighRiskActionDiscriminator;
  variantPredicate?: PropertyHighRiskActionVariantPredicate;
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

const EXPECTED_VARIANT_PREDICATES: Partial<
  Record<PropertyHighRiskActionId, PropertyHighRiskActionVariantPredicate>
> = {
  "housing.handovers.complete-move-out-financial": {
    allEquals: { handover_type: "move_out" },
    anyNonZero: [
      "damage_amount",
      "unsettled_amount",
      "deposit_deduction_amount"
    ]
  }
};

function hasExactKeys(
  value: object,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === [...expectedKeys].sort()[index]);
}

function hasExactValues(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isExactStringArray(
  value: unknown,
  expected: readonly string[]
): value is string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string")
    && hasExactValues(value, expected);
}

function hasExactAllEquals(
  value: unknown,
  expected: Readonly<Record<string, string>>
): boolean {
  if (!isPlainRecord(value)) return false;
  if (!hasExactKeys(value, Object.keys(expected))) return false;
  return Object.entries(expected).every(
    ([key, expectedValue]) => value[key] === expectedValue
  );
}

function hasExactDiscriminator(
  candidate: Record<string, unknown>,
  expected: PropertyHighRiskActionDiscriminator
): boolean {
  if (!hasExactKeys(candidate, ["actionId", "discriminator"])) return false;
  const actual = candidate.discriminator;
  if (!isPlainRecord(actual)) return false;
  return hasExactKeys(actual, ["bodyField", "highRiskValues"])
    && actual.bodyField === expected.bodyField
    && isExactStringArray(actual.highRiskValues, expected.highRiskValues);
}

function hasExactVariantPredicate(
  candidate: Record<string, unknown>,
  expected: PropertyHighRiskActionVariantPredicate
): boolean {
  if (!hasExactKeys(candidate, ["actionId", "variantPredicate"])) return false;
  const actual = candidate.variantPredicate;
  if (!isPlainRecord(actual)) return false;
  return hasExactKeys(actual, ["allEquals", "anyNonZero"])
    && hasExactAllEquals(actual.allEquals, expected.allEquals)
    && isExactStringArray(actual.anyNonZero, expected.anyNonZero);
}

export function isPropertyHighRiskActionMetadata(
  value: unknown
): value is PropertyHighRiskActionMetadata {
  if (!isPlainRecord(value)) return false;
  const candidate = value;
  if (
    typeof candidate.actionId !== "string"
    || !PROPERTY_HIGH_RISK_ACTION_IDS.has(candidate.actionId)
  ) {
    return false;
  }

  const actionId = candidate.actionId as PropertyHighRiskActionId;
  const expectedDiscriminator = EXPECTED_DISCRIMINATORS[actionId];
  const expectedVariantPredicate = EXPECTED_VARIANT_PREDICATES[actionId];
  if (expectedDiscriminator) {
    return hasExactDiscriminator(candidate, expectedDiscriminator);
  }
  if (expectedVariantPredicate) {
    return hasExactVariantPredicate(candidate, expectedVariantPredicate);
  }
  return hasExactKeys(candidate, ["actionId"]);
}

export const PropertyHighRiskAction = (
  actionId: PropertyHighRiskActionId,
  options?:
    | PropertyHighRiskActionDiscriminator
    | PropertyHighRiskActionVariantOptions
) => {
  const metadata = {
    actionId,
    ...(options && "variantPredicate" in options
      ? { variantPredicate: options.variantPredicate }
      : options
        ? { discriminator: options }
        : {})
  } satisfies PropertyHighRiskActionMetadata;
  if (!isPropertyHighRiskActionMetadata(metadata)) {
    throw new Error(`Invalid high-risk property action metadata: ${actionId}`);
  }
  return SetMetadata(PROPERTY_HIGH_RISK_ACTION_KEY, metadata);
};
