import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { ApprovalExecutionError } from "../property-approvals/property-approval.service";
import { PropertyOccupanciesService } from "./property-occupancies.service";

function fixture() {
  const occupancyId = "40000000-0000-4000-8000-000000000001";
  const unitId = "50000000-0000-4000-8000-000000000001";
  const occupancy = { id: occupancyId, unitId, sourceDomain: "operations", sourceType: "manual", sourceId: "fixture", status: "held", version: 3 };
  const options = { missing: false, manifest: true, cas: [{ version: 4 }], errorAt: "", error: null as unknown };
  const statements: string[] = [];
  const manager = { query: async (sql: string) => {
    statements.push(sql);
    if (options.errorAt && sql.includes(options.errorAt)) throw options.error;
    if (sql.includes("SELECT lock_property_unit_scope")) return [];
    if (sql.includes("FROM biz_property_occupancy occupancy")) return options.missing ? [] : [occupancy];
    if (sql.includes("FROM biz_property_execution_effect_manifest")) return options.manifest ? [{ effectHash: "a".repeat(64), effectLineKey: "line" }] : [];
    if (sql.includes("UPDATE biz_property_occupancy")) return [options.cas, options.cas.length];
    if (sql.includes("INSERT INTO biz_property_occupancy_release_audit")) return [[{ id: "audit" }], 1];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const input = {
    manager: manager as never, requestId: "request", executionIdempotencyKey: "execution", sourceExpectedVersion: 3,
    request: { tenantId: "tenant", parkId: "park", sourceId: occupancyId, sourceExpectedVersion: 3 },
    canonicalPayload: { occupancyId, unitId, sourceDomain: "operations", sourceType: "manual", sourceId: "fixture", fromStatus: "held", toStatus: "released", reason: "approved reason" }
  };
  const service = new PropertyOccupanciesService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { occupancy, options, statements, input, execute: () => service.executeApprovedForceRelease(input) };
}

test("matching occupancy performs one release and audit", async () => {
  const c = fixture(); await c.execute();
  assert.equal(c.statements.filter(s => s.includes("UPDATE biz_property_occupancy")).length, 1);
  assert.equal(c.statements.filter(s => s.includes("INSERT INTO biz_property_occupancy_release_audit")).length, 1);
});
for (const status of ["held", "active"]) {
  test(`version drift with ${status} is business before manifest or writes`, async () => {
    const c = fixture(); c.occupancy.version++; c.occupancy.status = status;
    await assert.rejects(c.execute(), (error: unknown) => {
      assert(error instanceof ApprovalExecutionError);
      assert.equal(error.category, "business"); assert.equal(error.stableCode, "approval-source-changed"); return true;
    });
    assert.equal(c.statements.length, 2);
    assert(c.statements.every(s => s.trimStart().startsWith("SELECT")));
  });
}
const boundaries: Array<[string, (c: ReturnType<typeof fixture>) => void, number]> = [
  ["missing occupancy", c => { c.options.missing = true; }, 2],
  ["same version status mismatch", c => { c.occupancy.status = "active"; }, 2],
  ["invalid toStatus", c => { c.input.canonicalPayload.toStatus = "active"; }, 2],
  ["input source mismatch", c => { c.input.request.sourceId = c.input.canonicalPayload.unitId; }, 0],
  ["missing manifest", c => { c.options.manifest = false; }, 3],
  ["CAS zero rows", c => { c.options.cas = []; }, 4],
  ["CAS wrong version", c => { c.options.cas = [{ version: 5 }]; }, 4]
];
for (const [name, change, count] of boundaries) {
  test(`${name} retains ordinary conflict`, async () => {
    const c = fixture(); change(c); await assert.rejects(c.execute(), ConflictException);
    assert.equal(c.statements.length, count);
    assert(!c.statements.some(s => s.includes("INSERT INTO biz_property_occupancy_release_audit")));
  });
}
for (const location of ["SELECT lock_property_unit_scope", "FROM biz_property_occupancy occupancy"]) {
  for (const code of ["40001", "40P01"]) {
    for (const wrapped of [false, true]) {
      test(`${location} ${code} driverError=${wrapped} preserves original error`, async () => {
        const c = fixture(); const error = Object.assign(new Error(code), wrapped ? { driverError: { code } } : { code });
        c.options.errorAt = location; c.options.error = error;
        await assert.rejects(c.execute(), actual => actual === error);
        assert(c.statements.every(s => s.trimStart().startsWith("SELECT")));
      });
    }
  }
}
