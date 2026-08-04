import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyApprovalEffectRegistry
} from "../property-approvals/property-approval.registries";
import { HomestayApprovalAdapter } from "./homestay-approval.adapter";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const bookingId = "30000000-0000-4000-8000-000000000001";
const occupancyId = "30000000-0000-4000-8000-000000000002";
const credentialId = "30000000-0000-4000-8000-000000000003";
const creatorId = "10000000-0000-4000-8000-000000000001";
const actorIds = {
  "property_approval:decide": "10000000-0000-4000-8000-000000000002",
  "property_approval:read": "10000000-0000-4000-8000-000000000003",
  "property_approval:retry": "10000000-0000-4000-8000-000000000004"
} as const;

function policyManager() {
  return {
    query: async (sql: string, parameters: unknown[]) => {
      if (sql.includes("FROM biz_homestay_booking")) return [{ actorId: creatorId }];
      if (sql.includes("FROM sys_user")) {
        const actorId = actorIds[parameters[2] as keyof typeof actorIds];
        return actorId ? [{ actorId }] : [];
      }
      throw new Error(`unexpected homestay policy query: ${sql}`);
    }
  };
}

test("homestay approval adapter registers every frozen action and proof kind once", () => {
  const policies = new FrozenPropertyApprovalPolicyResolver();
  const effects = new PropertyApprovalEffectRegistry();
  const proofs = new PropertyApprovalEffectProofVerifierRegistryService();
  const adapter = new HomestayApprovalAdapter(
    policies,
    effects,
    proofs,
    {} as never
  );

  adapter.onModuleInit();

  assert.ok(effects.get("homestay.bookings.cancel.request"));
  assert.ok(effects.get("homestay.finance.refund-or-waive.request"));
  for (const kind of [
    "homestay.booking.cancel",
    "homestay.ledger.waiver",
    "homestay.ledger.charge"
  ]) {
    assert.ok(proofs.get("homestay.bookings.cancel.request", kind));
  }
  for (const kind of ["homestay.ledger.refund", "homestay.ledger.waiver"]) {
    assert.ok(proofs.get("homestay.finance.refund-or-waive.request", kind));
  }
  assert.throws(() => adapter.onModuleInit(), /already registered/);
});

test("homestay policy resolver freezes actors and the exact 000191 effect owner", async () => {
  const policies = new FrozenPropertyApprovalPolicyResolver();
  const adapter = new HomestayApprovalAdapter(
    policies,
    new PropertyApprovalEffectRegistry(),
    new PropertyApprovalEffectProofVerifierRegistryService(),
    {} as never
  );
  adapter.onModuleInit();

  const policy = await policies.resolve({
    manager: policyManager() as never,
    scope,
    actionId: "homestay.bookings.cancel.request",
    sourceType: "homestay-booking",
    sourceId: bookingId,
    requesterId: "10000000-0000-4000-8000-000000000005",
    canonicalPayload: {
      bookingId,
      occupancy: { id: occupancyId, expectedVersion: 2,
        beforeStatus: "active", afterStatus: "cancelled" },
      credentials: [{ id: credentialId, expectedVersion: 3,
        beforeStatus: "issued", afterStatus: "void" }],
      roomWaiverAmount: "0.00",
      cancellationFeeAmount: "0.00"
    }
  });

  assert.deepEqual(policy.stages[0]?.eligibilityPolicySnapshot, {
    requiredPermissions: ["property_approval:decide"],
    eligibleActorIds: [actorIds["property_approval:decide"]],
    auditorActorIds: [actorIds["property_approval:read"]],
    incidentActorIds: [actorIds["property_approval:retry"]],
    sourceScopes: [{ sourceType: "homestay-booking", sourceId: bookingId }]
  });
  assert.deepEqual(policy.exclusions, [{
    actorId: creatorId,
    reasonCode: "source_creator",
    sourceType: "homestay-booking",
    sourceId: bookingId
  }]);
  assert.deepEqual(policy.effects.map((effect) => ({
    effectKind: effect.effectKind,
    owningTable: effect.owningTable,
    owningUniqueName: effect.owningUniqueName,
    expectedCardinality: effect.expectedCardinality
  })), [{
    effectKind: "homestay.booking.cancel",
    owningTable: "biz_homestay_booking_action_log",
    owningUniqueName: "uq_homestay_action_approval_line",
    expectedCardinality: 4
  }]);
});
