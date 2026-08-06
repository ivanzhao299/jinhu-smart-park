import assert from "node:assert/strict";
import test from "node:test";
import {
  PropertyHighRiskAction,
  isPropertyHighRiskActionMetadata
} from "./property-high-risk-action.decorator";

const moveOutFinancialMetadata = {
  actionId: "housing.handovers.complete-move-out-financial",
  variantPredicate: {
    allEquals: { handover_type: "move_out" },
    anyNonZero: [
      "damage_amount",
      "unsettled_amount",
      "deposit_deduction_amount"
    ]
  }
} as const;

test("metadata validator accepts only the exact move-out financial predicate", () => {
  assert.equal(
    isPropertyHighRiskActionMetadata(moveOutFinancialMetadata),
    true
  );
  for (const metadata of [
    { actionId: moveOutFinancialMetadata.actionId },
    {
      ...moveOutFinancialMetadata,
      variantPredicate: {
        ...moveOutFinancialMetadata.variantPredicate,
        allEquals: { handover_type: "move_in" }
      }
    },
    {
      ...moveOutFinancialMetadata,
      variantPredicate: {
        ...moveOutFinancialMetadata.variantPredicate,
        anyNonZero: ["damage_amount", "unsettled_amount"]
      }
    },
    {
      ...moveOutFinancialMetadata,
      variantPredicate: {
        ...moveOutFinancialMetadata.variantPredicate,
        allEquals: {
          handover_type: "move_out",
          unexpected: "value"
        }
      }
    },
    {
      ...moveOutFinancialMetadata,
      variantPredicate: {
        ...moveOutFinancialMetadata.variantPredicate,
        anyNonZero: [
          "damage_amount",
          "deposit_deduction_amount",
          "unsettled_amount"
        ]
      }
    },
    {
      ...moveOutFinancialMetadata,
      variantPredicate: {
        ...moveOutFinancialMetadata.variantPredicate,
        unexpected: true
      }
    },
    { ...moveOutFinancialMetadata, unexpected: true }
  ]) {
    assert.equal(isPropertyHighRiskActionMetadata(metadata), false);
  }
});

test("metadata validator preserves exact ledger discriminators and plain actions", () => {
  assert.equal(
    isPropertyHighRiskActionMetadata({
      actionId: "homestay.finance.refund-or-waive",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", "waiver"]
      }
    }),
    true
  );
  assert.equal(
    isPropertyHighRiskActionMetadata({
      actionId: "housing.leases.approve"
    }),
    true
  );
  assert.equal(
    isPropertyHighRiskActionMetadata({
      actionId: "housing.leases.approve",
      discriminator: undefined
    }),
    false
  );
  for (const metadata of [
    null,
    [],
    { actionId: "housing.unknown" },
    { actionId: "homestay.finance.refund-or-waive" },
    {
      actionId: "homestay.finance.refund-or-waive",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["waiver", "refund"]
      }
    },
    {
      actionId: "homestay.finance.refund-or-waive",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", 1]
      }
    },
    {
      actionId: "homestay.finance.refund-or-waive",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", "waiver"],
        unexpected: true
      }
    }
  ]) {
    assert.equal(isPropertyHighRiskActionMetadata(metadata), false);
  }
});

test("decorator rejects controller-declared metadata that differs from canonical risk", () => {
  assert.throws(
    () => PropertyHighRiskAction(
      "housing.handovers.complete-move-out-financial"
    ),
    /Invalid high-risk property action metadata/u
  );
  assert.throws(
    () => PropertyHighRiskAction(
      "housing.handovers.complete-move-out-financial",
      {
        variantPredicate: {
          allEquals: { handover_type: "move_out" },
          anyNonZero: ["damage_amount"]
        }
      }
    ),
    /Invalid high-risk property action metadata/u
  );
  assert.doesNotThrow(
    () => PropertyHighRiskAction(
      "housing.handovers.complete-move-out-financial",
      { variantPredicate: moveOutFinancialMetadata.variantPredicate }
    )
  );
});
