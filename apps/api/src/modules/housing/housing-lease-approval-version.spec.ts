import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ApprovalExecutionError } from "../property-approvals/property-approval.service";
import { HousingLeaseApprovalExecutorService } from "./housing-lease-approval-executor.service";

type Action = Parameters<HousingLeaseApprovalExecutorService["execute"]>[1];
const actions: Action[] = ["housing.leases.approve.request", "housing.leases.void.request", "housing.leases.checkout.request"];
function fixture(action: Action) {
  const id = "40000000-0000-4000-8000-000000000001";
  const lease = { id, unitId: "unit", status: "pending_approval", version: 3, occupancyId: "occupancy" };
  const options = { missing: false, pointerMissing: false, occupancyMissing: false,
    pointerChanged: false, handoverMissing: false, manifestMissing: false, casMissing: false,
    errorAt: "", error: null as unknown };
  const queries: string[] = [];
  const manager = { query: async (sql: string) => {
    queries.push(sql);
    if (options.errorAt && sql.includes(options.errorAt)) throw options.error;
    if (sql.includes('SELECT occupancy_id::text')) return options.pointerMissing ? [] : [{ occupancyId: "occupancy" }];
    if (sql.includes("FROM biz_property_occupancy")) return options.occupancyMissing ? [] : [{ id: "occupancy", version: 2, status: "active" }];
    if (sql.includes("FROM biz_housing_lease")) return options.missing ? [] : [{ ...lease, occupancyId: options.pointerChanged ? "changed" : lease.occupancyId }];
    if (sql.includes("FROM biz_housing_handover")) return options.handoverMissing ? [] : [{ id, version: 1 }];
    if (sql.includes("FROM biz_housing_receivable") || sql.includes("FROM biz_housing_ledger_entry")) return [];
    if (sql.includes("FROM biz_property_execution_effect_manifest")) return options.manifestMissing ? [] : [{ effectKind: "void", effectLineKey: "lease", effectHash: "hash" }];
    if (sql.includes("FROM biz_property_approval_decision")) return [{ actorId: "approver" }];
    if (sql.includes("UPDATE biz_housing_lease")) return options.casMissing ? [[], 0] : [[{ version: 4, checkoutAt: null }], 1];
    if (sql.includes("INSERT INTO biz_housing_lease_effect_audit")) return [[{ id: "audit" }], 1];
    throw Error(`Unexpected SQL ${sql}`);
  } };
  const service = new HousingLeaseApprovalExecutorService({} as never, {} as never, {} as never,
    { project: async () => ({}) } as never);
  const successors: string[] = [];
  // Only downstream domain effects are replaced; execute and all source/snapshot locks remain real.
  Object.assign(service, {
    approveLease: async () => { successors.push("approve"); },
    validateCheckoutAndReleaseOccupancy: async () => {
      successors.push("checkout"); return { sourceVersion: 2, resultingVersion: 3 };
    }
  });
  const input = { manager: manager as never, requestId: "request", executionIdempotencyKey: "key",
    sourceExpectedVersion: 3, canonicalPayload: { leaseId: id, fromStatus: "pending_approval", reason: "reason" },
    request: { tenantId: "tenant", parkId: "park", sourceId: id, requesterId: "requester" } };
  return { input, lease, options, queries, successors, execute: () => service.execute(input, action) };
}
for (const action of actions) {
  test(`${action}: matching version reaches its successor`, async () => {
    const c = fixture(action); await c.execute();
    if (action.includes("approve")) assert.deepEqual(c.successors, ["approve"]);
    else assert.equal(c.queries.filter(sql => sql.includes("INSERT INTO biz_housing_lease_effect_audit")).length, 1);
  });
  for (const delta of [-1, 1]) for (const changedStatus of [false, true]) {
    test(`${action}: version ${delta}, status changed ${changedStatus} is business`, async () => {
      const c = fixture(action); c.lease.version += delta;
      if (changedStatus) c.lease.status = "void";
      await assert.rejects(c.execute(), (error: unknown) => {
        assert(error instanceof ApprovalExecutionError); assert.equal(error.category, "business");
        assert.equal(error.stableCode, "approval-source-changed"); return true;
      });
      assert.equal(c.successors.length, 0); assert(c.queries.every(sql => sql.startsWith("SELECT")));
      assert(!c.queries.some(sql => sql.includes("effect_manifest")));
    });
  }
  for (const boundary of ["status", "missing", "invalid-uuid", "source", "manifest"] as const) {
    test(`${action}: ${boundary} retains its original exception`, async () => {
      const c = fixture(action);
      if (boundary === "status") c.lease.status = "void";
      if (boundary === "missing") c.options.missing = true;
      if (boundary === "invalid-uuid") c.input.canonicalPayload.leaseId = "invalid";
      if (boundary === "source") c.input.request.sourceId = "other";
      if (boundary === "manifest") c.options.manifestMissing = true;
      await assert.rejects(c.execute(), boundary === "missing" && action.includes("checkout") ? NotFoundException : ConflictException);
      assert.equal(c.successors.length, 0);
    });
  }
  const locks = action.includes("checkout")
    ? ['SELECT occupancy_id::text', "FROM biz_property_occupancy", "FROM biz_housing_lease", "FROM biz_housing_handover", "FROM biz_housing_receivable", "FROM biz_housing_ledger_entry"]
    : ["FROM biz_housing_lease"];
  for (const lock of locks) for (const code of ["40001", "40P01"]) for (const nested of [false, true]) {
    test(`${action}: ${lock} ${code} nested=${nested} propagates same object`, async () => {
      const c = fixture(action); const error = nested ? { driverError: { code } } : { code };
      c.options.errorAt = lock; c.options.error = error;
      await assert.rejects(c.execute(), actual => actual === error);
      assert.equal(c.successors.length, 0);
    });
  }
}
for (const field of ["pointerMissing", "occupancyMissing", "pointerChanged", "handoverMissing"] as const) {
  test(`checkout ${field} precedes version classification`, async () => {
    const c = fixture("housing.leases.checkout.request"); c.lease.version++; c.options[field] = true;
    await assert.rejects(c.execute(), field === "pointerMissing" ? NotFoundException : ConflictException);
    assert.equal(c.successors.length, 0);
  });
}
test("void CAS failure remains ordinary conflict and emits no audit", async () => {
  const c = fixture("housing.leases.void.request"); c.options.casMissing = true;
  await assert.rejects(c.execute(), ConflictException);
  assert(!c.queries.some(sql => sql.includes("INSERT INTO")));
});
