import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyApprovalEffectRegistry
} from "../property-approvals/property-approval.registries";
import { HousingApprovalAdapter } from "./housing-approval.adapter";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const leaseId = "30000000-0000-4000-8000-000000000001";
const occupancyId = "30000000-0000-4000-8000-000000000002";
const handoverId = "30000000-0000-4000-8000-000000000003";
const receivableId = "30000000-0000-4000-8000-000000000004";
const creatorId = "10000000-0000-4000-8000-000000000001";
const actorIds = {
  "property_approval:decide": "10000000-0000-4000-8000-000000000002",
  "property_approval:read": "10000000-0000-4000-8000-000000000003",
  "property_approval:retry": "10000000-0000-4000-8000-000000000004"
} as const;

function policyManager() {
  return {
    query: async (sql: string, parameters: unknown[]) => {
      if (sql.includes("FROM biz_housing_lease") || sql.includes("FROM biz_housing_handover")) {
        return [{ creator: creatorId, executor: creatorId }];
      }
      if (sql.includes("FROM sys_user")) {
        const actorId = actorIds[parameters[2] as keyof typeof actorIds];
        return actorId ? [{ actorId }] : [];
      }
      throw new Error(`unexpected housing policy query: ${sql}`);
    }
  };
}

const ACTION_KINDS = {
  "housing.leases.approve.request": ["housing.lease.approve"],
  "housing.leases.void.request": ["housing.lease.void"],
  "housing.leases.checkout.request": ["housing.lease.checkout"],
  "housing.finance.refund-waive-or-deposit-refund.request": [
    "housing.ledger.refund", "housing.ledger.waiver", "housing.ledger.deposit.refund"
  ],
  "housing.handovers.complete-move-out-financial.request": [
    "housing.handover.complete.financial", "housing.receivable.checkout", "housing.ledger.deduction"
  ],
  "housing.purchases.lifecycle.request": ["housing.purchase.lifecycle"],
  "housing.purchases.transfer.request": [
    "housing.purchase.transfer", "housing.receivable.purchase.transfer"
  ]
} as const;

test("housing approval adapter registers every frozen action and proof kind once", () => {
  const policies = new FrozenPropertyApprovalPolicyResolver();
  const effects = new PropertyApprovalEffectRegistry();
  const proofs = new PropertyApprovalEffectProofVerifierRegistryService();
  const adapter = new HousingApprovalAdapter(policies, effects, proofs, {} as never);

  adapter.onModuleInit();

  for (const [actionId, kinds] of Object.entries(ACTION_KINDS)) {
    assert.ok(effects.get(actionId as keyof typeof ACTION_KINDS));
    for (const kind of kinds) {
      assert.ok(proofs.get(actionId as keyof typeof ACTION_KINDS, kind));
    }
  }
  assert.throws(() => adapter.onModuleInit(), /already registered/);
});

test("housing policy resolver freezes actor snapshots and exact 000192 owners", async () => {
  const policies = new FrozenPropertyApprovalPolicyResolver();
  const adapter = new HousingApprovalAdapter(
    policies,
    new PropertyApprovalEffectRegistry(),
    new PropertyApprovalEffectProofVerifierRegistryService(),
    {} as never
  );
  adapter.onModuleInit();
  const manager = policyManager() as never;
  const common = {
    manager,
    scope,
    requesterId: "10000000-0000-4000-8000-000000000005"
  };

  const approval = await policies.resolve({
    ...common,
    actionId: "housing.leases.approve.request",
    sourceType: "housing-lease",
    sourceId: leaseId,
    canonicalPayload: { leaseId }
  });
  assert.equal(approval.effects[0]?.owningTable, "biz_housing_lease");
  assert.equal(approval.effects[0]?.owningUniqueName, "biz_housing_lease_pkey");
  assert.deepEqual(approval.stages[0]?.eligibilityPolicySnapshot, {
    requiredPermissions: ["property_approval:decide"],
    eligibleActorIds: [actorIds["property_approval:decide"]],
    auditorActorIds: [actorIds["property_approval:read"]],
    incidentActorIds: [actorIds["property_approval:retry"]],
    sourceScopes: [{ sourceType: "housing-lease", sourceId: leaseId }]
  });
  assert.deepEqual(approval.exclusions, [{
    actorId: creatorId,
    reasonCode: "source_creator",
    sourceType: "housing-lease",
    sourceId: leaseId
  }]);

  const handover = await policies.resolve({
    ...common,
    actionId: "housing.handovers.complete-move-out-financial.request",
    sourceType: "housing-handover",
    sourceId: handoverId,
    canonicalPayload: {
      handoverId,
      checkoutReceivableId: receivableId,
      checkoutReceivableAmount: "10.00",
      currency: "CNY"
    }
  });
  assert.deepEqual(handover.effects.map((effect) => ({
    effectKind: effect.effectKind,
    owningTable: effect.owningTable,
    owningUniqueName: effect.owningUniqueName
  })), [{
    effectKind: "housing.handover.complete.financial",
    owningTable: "biz_housing_lease_effect_audit",
    owningUniqueName: "uq_housing_lease_effect_audit_approval_line"
  }, {
    effectKind: "housing.receivable.checkout",
    owningTable: "biz_housing_receivable",
    owningUniqueName: "biz_housing_receivable_pkey"
  }]);
});

test("housing checkout policy cardinality is exactly 2 without occupancy and 3 with occupancy", async () => {
  const policies = new FrozenPropertyApprovalPolicyResolver();
  const proofs = new PropertyApprovalEffectProofVerifierRegistryService();
  const adapter = new HousingApprovalAdapter(
    policies,
    new PropertyApprovalEffectRegistry(),
    proofs,
    {} as never
  );
  adapter.onModuleInit();
  const common = {
    manager: policyManager() as never,
    scope,
    actionId: "housing.leases.checkout.request" as const,
    sourceType: "housing-lease",
    sourceId: leaseId,
    requesterId: "10000000-0000-4000-8000-000000000005"
  };

  const withoutOccupancy = await policies.resolve({
    ...common,
    canonicalPayload: { leaseId, occupancyId: null }
  });
  const withOccupancy = await policies.resolve({
    ...common,
    canonicalPayload: { leaseId, occupancyId }
  });

  assert.equal(withoutOccupancy.effects[0]?.expectedCardinality, 2);
  assert.equal(withOccupancy.effects[0]?.expectedCardinality, 3);

  let proofQuery = "";
  const proof = await proofs.get(
    "housing.leases.checkout.request",
    "housing.lease.checkout"
  )!.verify({
    manager: {
      query: async (sql: string) => {
        proofQuery = sql;
        return [{ id: leaseId, observed: 3 }];
      }
    } as never,
    scope,
    requestId: "40000000-0000-4000-8000-000000000001",
    executionIdempotencyKey: "checkout-execution",
    effectLineKey: `lease:${leaseId}`,
    expectedCardinality: 3,
    owningTable: "biz_housing_lease_effect_audit",
    owningUniqueName: "uq_housing_lease_effect_audit_approval_line"
  });
  assert.equal(proof.observedCardinality, 3);
  assert.match(proofQuery, /audit\.occupancy_id IS NULL/);
});
