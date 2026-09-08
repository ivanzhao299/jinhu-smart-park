import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { verifyHrRealImportReads, type HrRealImportReadService, HrRealImportReadProbeError } from "./hr-real-import-read-probe";

const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const actor = { ...scope, sub: "fixture-actor", username: "fixture", permissions: ["*"], roles: ["fixture-role"], isSuper: true };
const expectedCounts = { employees: 43, contracts: 5, attendanceCalendars: 2, insurancePeriods: 1 };
type Mutation = (domain: string, page: number, denied: boolean, value: Record<string, unknown>) => void;
function service(mutate?: Mutation, detailDefect?: string) {
  const calls: Array<{ domain: string; page: number; pageSize: number; denied: boolean }> = [];
  const methods: Record<string, unknown> = {};
  for (const [domain, total] of Object.entries(expectedCounts)) {
    const name = { employees: "listEmployees", contracts: "listContracts", attendanceCalendars: "listAttendanceCalendars", insurancePeriods: "listInsurancePeriods" }[domain]!;
    methods[name] = async (_scope: unknown, principal: typeof actor, query: { page: number; page_size: number }) => {
      const denied = principal.permissions.length === 0;
      if (denied) { assert.equal(principal.isSuper, false); assert.deepEqual(principal.roles, []); }
      calls.push({ domain, page: query.page, pageSize: query.page_size, denied });
      const value: Record<string, unknown> = { total: denied ? 0 : total, page: query.page, page_size: query.page_size,
        items: denied ? [] : Array.from({ length: Math.min(query.page_size, Math.max(0, total - (query.page - 1) * query.page_size)) }, (_, index) => ({ id: `${domain}-${(query.page - 1) * query.page_size + index}`, privateValue: "PRIVATE-ROW" })) };
      mutate?.(domain, query.page, denied, value); return value;
    };
  }
  for (const [name, message] of [["contractDetail", "Contract not found"], ["insurancePeriodDetail", "Insurance period not found"]]) {
    methods[name!] = async (_scope: unknown, principal: typeof actor, id: string) => {
      assert.deepEqual(_scope, scope);
      if (!principal.permissions.length) {
        if (detailDefect === "exposed") return { id, privateValue: "PRIVATE-ROW" };
        if (detailDefect === "leaky404") throw new NotFoundException("PRIVATE-ROW");
        if (detailDefect === "driver") throw new Error("PRIVATE-ROW");
        throw new NotFoundException(message);
      }
      return { id: detailDefect === "wrongId" ? "wrong" : id, privateValue: "PRIVATE-ROW" };
    };
  }
  // Deliberately narrow synthetic method results; runtime shape validation is
  // the subject under test. The production entry accepts actual HrService Pick.
  return { adapter: methods as unknown as HrRealImportReadService, calls };
}
test("bounded actual method interface verifies totals/pages/details and denied access with aggregate-only output", async () => {
  const stub = service(), original = structuredClone(actor);
  const result = await verifyHrRealImportReads({ service: stub.adapter, scope, actor, expectedCounts });
  assert.deepEqual(actor, original);
  assert.deepEqual(result.observedCounts, expectedCounts);
  assert.equal(result.checks.length, 20);
  assert.equal(result.verificationLayer, "service_only");
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.httpVerified, false);
  assert.equal(result.auditPersistenceVerified, false);
  assert.equal(stub.calls.length, 16);
  assert(stub.calls.every(call => call.pageSize <= 20 && [1, 2].includes(call.page)));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-ROW|fixture-actor|privateValue/);
});
for (const [name, mutate] of [
  ["empty data with claimed positive count", (_d, _p, denied, value) => { if (!denied) value.items = []; }],
  ["wrong total", (_d, _p, denied, value) => { if (!denied) value.total = 0; }],
  ["wrong page", (_d, _p, denied, value) => { if (!denied) value.page = 99; }],
  ["overlapping pages", (_d, page, denied, value) => { if (!denied && page === 2) (value.items as Array<{ id: string }>)[0]!.id = "employees-0"; }],
  ["denied list leaks rows", (_d, _p, denied, value) => { if (denied) value.items = [{ id: "PRIVATE-ROW" }]; }],
  ["duplicate page IDs", (_d, _p, denied, value) => { if (!denied) for (const row of value.items as Array<{ id: string }>) row.id = "duplicate"; }],
  ["raw error sanitized", () => { throw new Error("PRIVATE-ROW password=dont-print"); }],
] as Array<[string, Mutation]>) test(name, async () => {
  await assert.rejects(verifyHrRealImportReads({ service: service(mutate).adapter, scope, actor, expectedCounts }), error =>
    error instanceof HrRealImportReadProbeError && /^HR_READ_PROBE_[A-Z0-9_]+$/.test(error.message) && !/PRIVATE|password/.test(error.message));
});
test("driver failure retains exact step and SQLSTATE without private diagnostic", async () => {
  const stub = service(domain => {
    if (domain === "insurancePeriods") throw Object.assign(new Error("PRIVATE-ROW"), { driverError: { code: "42703", detail: "PRIVATE-ROW" } });
  });
  await assert.rejects(verifyHrRealImportReads({ service: stub.adapter, scope, actor, expectedCounts }), error =>
    error instanceof HrRealImportReadProbeError && error.code === "HR_READ_PROBE_INSURANCEPERIODS_PAGE1_FAILED_SQLSTATE_42703" && !JSON.stringify(error).includes("PRIVATE"));
});
for (const defect of ["exposed", "leaky404", "driver", "wrongId"]) test(`detail defect ${defect} fails safely`, async () => {
  await assert.rejects(verifyHrRealImportReads({ service: service(undefined, defect).adapter, scope, actor, expectedCounts }), error =>
    error instanceof HrRealImportReadProbeError && !error.message.includes("PRIVATE-ROW"));
});
test("zero expected counts or mismatched actor scope rejected before service access", async () => {
  const stub = service();
  for (const input of [{ actor, expectedCounts: { ...expectedCounts, employees: 0 } }, { actor: { ...actor, parkId: "other" }, expectedCounts }]) {
    await assert.rejects(verifyHrRealImportReads({ service: stub.adapter, scope, ...input }), HrRealImportReadProbeError);
  }
  assert.equal(stub.calls.length, 0);
});
test("migration proof metadata never becomes a TypeORM business scope predicate", async () => {
  const stub = service();
  const original = stub.adapter.listInsurancePeriods.bind(stub.adapter);
  stub.adapter.listInsurancePeriods = async (actualScope, ...args) => {
    assert.deepEqual(actualScope, scope);
    return original(actualScope, ...args);
  };
  const migrationScope = { ...scope, scopeSha256: "a".repeat(64) };
  const result = await verifyHrRealImportReads({ service: stub.adapter, scope: migrationScope, actor, expectedCounts });
  assert.equal(result.status, "PASS");
  assert.equal(migrationScope.scopeSha256, "a".repeat(64));
});
