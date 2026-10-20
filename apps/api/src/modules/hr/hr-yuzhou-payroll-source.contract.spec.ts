import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { canonicalJson, yuzhouPayrollSourceHashInputs, type YuzhouPayrollSourcePackage } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import { HrYuzhouPayrollSourceService } from "./hr-yuzhou-payroll-source.service";
const scope = { tenantId: "synthetic", parkId: "synthetic" };
const actor: JwtPrincipal = { ...scope, sub: "00000000-0000-4000-8000-000000000001", username: "synthetic", roles: [],
  permissions: ["hr:payroll:manage", "hr:payroll_reconciliation:review", "hr:payroll_detail:read"] };
const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
function fixture(): YuzhouPayrollSourcePackage {
  const pkg: YuzhouPayrollSourcePackage = { version: 1, sourceSystem: "yuzhou-v10", targetScope: scope,
    sourceInstance: "synthetic", manifestId: "synthetic", month: "2026-07", extractedAt: "2026-10-20T00:00:00Z",
    evidenceSha256: sha("evidence"), expectedHeadVersion: 0, expectedHeadHash: null,
    bookSetSha256: "", rosterSha256: "", catalogSha256: "", books: [{ scheme: 34, bookName: null,
      closeState: 1, closeSourceHash: sha("close"), formulas: [], items: [{ legacyItemName: "U1", itemCode: "U1", displayName: "合成项目",
        valueType: "decimal", legacyItemType: "数值", legacyAddOrSub: "增加项", itemCategory: "earning", decimalScale: 4,
        sortNo: 1, sourceHash: sha("item") }], records: [{ sourcePersonIdentity: "SYNTHETIC", employeeMappingId: actor.sub,
        sourceRowSha256: sha("row"), sourceTable: "salary34", summary: {}, values: [{ column: "U1", valueType: "decimal",
          isSourceNull: false, decimalValue: "1.0000", sourceHash: sha("value") }] }] }] };
  Object.assign(pkg, Object.fromEntries(Object.entries(yuzhouPayrollSourceHashInputs(pkg)).map(([key, value]) => [key, sha(value)])));
  return pkg;
}
function harness(registered = true) {
  const queries: string[] = [];
  let transactions = 0;
  const manager = { query: async (sql: string) => { queries.push(sql); return sql.includes("FROM hr_yuzhou_payroll_source_extraction") && registered ? [{ id: "synthetic-proof" }] : []; } };
  const db = { transaction: async (run: (m: typeof manager) => Promise<unknown>) => { transactions++; return run(manager); } } as unknown as DataSource;
  const service = new HrYuzhouPayrollSourceService(db, {} as PartySensitiveDataService, {} as AuditService);
  return { service, queries, transactions: () => transactions };
}
test("API rejects malformed packages and forged declared digests before any persistence", async () => {
  for (const mutate of [
    (p: YuzhouPayrollSourcePackage) => { p.catalogSha256 = sha("forged"); },
    (p: YuzhouPayrollSourcePackage) => { p.rosterSha256 = sha("forged"); },
    (p: YuzhouPayrollSourcePackage) => { p.bookSetSha256 = sha("forged"); },
    (p: YuzhouPayrollSourcePackage) => { Object.assign(p.books[0]!.records[0]!.values[0]!, { secretUnexpected: "PRIVATE_SENTINEL" }); },
  ]) {
    const h = harness(), pkg = fixture(); mutate(pkg);
    await assert.rejects(h.service.preview(scope, actor, pkg as unknown as Record<string, unknown>),
      error => error instanceof BadRequestException && error.message === "YUZHOU_PAYROLL_SOURCE_PACKAGE_INVALID");
    assert.equal(h.transactions(), 0); assert.deepEqual(h.queries, []);
  }
});
test("source authority and target scope are checked before database probes", async () => {
  for (const permission of actor.permissions) {
    const h = harness();
    await assert.rejects(h.service.preview(scope, { ...actor, permissions: actor.permissions.filter(p => p !== permission) }, fixture() as unknown as Record<string, unknown>), ForbiddenException);
    assert.equal(h.transactions(), 0);
  }
  const h = harness();
  await assert.rejects(h.service.preview({ ...scope, parkId: "other" }, actor, fixture() as unknown as Record<string, unknown>), ForbiddenException);
  const foreign = fixture(); foreign.targetScope = { ...scope, parkId: "other" };
  await assert.rejects(h.service.preview(scope, actor, foreign as unknown as Record<string, unknown>), ForbiddenException);
  assert.equal(h.transactions(), 0);
});
test("new previews verify exact live employee mappings before inserting encrypted staging", async () => {
  const h = harness();
  await assert.rejects(h.service.preview(scope, actor, fixture() as unknown as Record<string, unknown>), /mapping must prove exact/);
  assert.equal(h.transactions(), 1);
  assert.ok(h.queries.some(sql => sql.includes("FROM hr_employee") && sql.includes("FOR SHARE")));
  assert.equal(h.queries.some(sql => sql.startsWith("INSERT")), false);
});

test("API refuses unregistered first-month claims before staging", async () => {
  const h = harness(false);
  await assert.rejects(h.service.preview(scope, actor, fixture() as unknown as Record<string, unknown>), /VERIFIED_EXTRACTION_REQUIRED/);
  assert.equal(h.queries.some(sql => sql.startsWith("INSERT")), false);
});
