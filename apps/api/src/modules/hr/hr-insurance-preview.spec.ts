import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateHrInsuranceReferencePreviewDto } from "./dto/hr-insurance-preview.dto";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { HrInsurancePreviewController } from "./hr-insurance-preview.controller";
import { HrInsurancePreviewService } from "./hr-insurance-preview.service";

const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const policyId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const actor: JwtPrincipal = { ...scope, sub: "fixture-actor", username: "fixture", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ] };
function request(): CreateHrInsuranceReferencePreviewDto {
  return { policyId, employeeId, expectedPolicyVersion: 1, variantNo: 1, periodYear: 2026, periodMonth: 7, includeFund: false, bases: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, contributionBase: "1000.00" })) };
}

function harness(options: { employeeMissing?: boolean; policyMissing?: boolean; version?: number; nullRate?: boolean; auditFails?: boolean } = {}) {
  let reads = 0; const audits: Array<Record<string, unknown>> = [];
  const db = { transaction: async (run: (manager: unknown) => Promise<unknown>) => run({ query: async (sql: string, params: unknown[]) => {
    reads++;
    assert.match(sql, /^SELECT /u); assert.match(sql, /tenant_id=\$2 AND park_id=\$3/u); assert.match(sql, /AND is_deleted=false\b/u); assert.match(sql, /FOR SHARE$/u);
    assert.deepEqual(params.slice(1, 3), [scope.tenantId, scope.parkId]);
    if (sql.includes("FROM hr_employee ")) { assert.equal(params[0], employeeId); return options.employeeMissing ? [] : [{ id: employeeId, version: 2 }]; }
    if (sql.includes("FROM hr_insurance_policy ")) { assert.equal(params[0], policyId); return options.policyMissing ? [] : [{ id: policyId, policy_code: "FIXTURE", policy_name: "合成政策", version: options.version ?? 1, status: "historical" }]; }
    assert.equal(params[0], policyId); assert.equal(params[3], 1);
    return HR_INSURANCE_KINDS.map((insurance_kind, i) => ({ id: `item-${i}`, version: 1, insurance_kind, base_rate: "0.1", employer_rate: "0.2", employee_rate: options.nullRate ? null : "0.08", supplement_rate: "0", base_fixed_amount: null, employer_fixed_amount: null, employee_fixed_amount: null, supplement_fixed_amount: null }));
  } }) };
  const audit = { recordOperationRequired: async (entry: Record<string, unknown>) => { if (options.auditFails) throw new Error("fixture audit unavailable"); audits.push(entry); } };
  const service = Reflect.construct(HrInsurancePreviewService, [db, audit]) as HrInsurancePreviewService;
  return { service, audits, reads: () => reads };
}

test("reference API binds scoped policy, variant, employee and canonical inputs without writes", async () => {
  const h = harness(); const dto = request(); const result = await h.service.referencePreview(scope, actor, dto);
  assert.equal(h.reads(), 3); assert.equal(result.calculation.totals.employee, "400.00");
  assert.equal(result.calculation.items[5]!.amounts.employee, "80.00");
  assert.equal(result.confirmationEligible, false); assert.equal(result.mode, "reference_only");
  assert.equal(result.policy.status, "historical"); assert.match(result.inputHash, /^[0-9a-f]{64}$/u);
  assert.equal(h.audits.length, 1); assert.equal(h.audits[0]!.method, "POST");
  const auditPayload = JSON.stringify(h.audits[0]!.afterJson);
  assert.ok(!auditPayload.includes(employeeId)); assert.ok(!auditPayload.includes("1000.00")); assert.ok(!auditPayload.includes("400.00"));
  const reversed = await h.service.referencePreview(scope, actor, { ...dto, bases: [...dto.bases].reverse() });
  assert.equal(reversed.inputHash, result.inputHash);
  const changed = await h.service.referencePreview(scope, actor, { ...dto, includeFund: true });
  assert.notEqual(changed.inputHash, result.inputHash);
});

test("all full-scope permissions are mandatory even through direct service calls", async () => {
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrInsurancePreviewController).captureBody,false);
  for (const permissions of [[], [HR_PERMISSIONS.HR_INSURANCE_TEAM_READ], [HR_PERMISSIONS.HR_INSURANCE_SELF_READ], actor.permissions.slice(0, 2), [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ]]) {
    const h = harness(); await assert.rejects(h.service.referencePreview(scope, { ...actor, permissions }, request()), /FORBIDDEN/u);
    assert.equal(h.reads(), 0); assert.equal(h.audits.length, 0);
  }
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, HrInsurancePreviewController.prototype.referencePreview), actor.permissions);
});

test("unavailable sources, stale version, missing rate and invalid inputs fail before returning", async () => {
  for (const [options, error] of [[{ employeeMissing: true }, /SOURCE_NOT_FOUND/u], [{ policyMissing: true }, /SOURCE_NOT_FOUND/u], [{ version: 2 }, /VERSION_CHANGED/u], [{ nullRate: true }, /fractional rate missing/u]] as const) {
    const h = harness(options); await assert.rejects(h.service.referencePreview(scope, actor, request()), error); assert.equal(h.audits.length, 0);
  }
  const h = harness(); const dto = request(); dto.bases[5]!.insuranceKind = "oldage";
  await assert.rejects(h.service.referencePreview(scope, actor, dto), /SIX_BASES/u); assert.equal(h.reads(), 0);
  await assert.rejects(h.service.referencePreview(scope, actor, { ...request(), periodMonth: 13 }), /PERIOD_OR_VARIANT/u);
});

test("required audit failure prevents calculated financial response", async () => {
  await assert.rejects(harness({ auditFails: true }).service.referencePreview(scope, actor, request()), /audit unavailable/u);
});

test("HTTP DTO rejects coercion, missing fund choice, extra precision and incomplete bases", async () => {
  assert.equal((await validate(plainToInstance(CreateHrInsuranceReferencePreviewDto, request()))).length, 0);
  for (const input of [{ ...request(), includeFund: "false" }, { ...request(), includeFund: undefined }, { ...request(), periodMonth: "7" }, { ...request(), expectedPolicyVersion: 0 }, { ...request(), bases: [{ insuranceKind: "oldage", contributionBase: "1.001" }] }]) {
    assert.ok((await validate(plainToInstance(CreateHrInsuranceReferencePreviewDto, input))).length > 0);
  }
});

test("policy selector paginates scoped metadata and audits empty results before responding", async () => {
  for (const empty of [false, true]) {
    let reads = 0, audits = 0;
    const db = { query: async (sql: string, params: unknown[]) => {
      reads++; assert.deepEqual(params.slice(0, 3), [scope.tenantId, scope.parkId, "%FIXTURE%"]);
      assert.match(sql, /p\.tenant_id=\$1 AND p\.park_id=\$2 AND p\.is_deleted=false/u);
      if (sql.includes("count(*)")) return [{ total: empty ? 0 : 25 }];
      assert.deepEqual(params.slice(3), [20, 20]); assert.match(sql, /ORDER BY p\.policy_code,p\.id LIMIT \$4 OFFSET \$5/u);
      assert.match(sql, /i\.tenant_id=p\.tenant_id AND i\.park_id=p\.park_id AND i\.is_deleted=false/u);
      return empty ? [] : [{ id: policyId, policy_code: "FIXTURE", policy_name: "合成政策", version: 1, status: "historical", variants: [1, 2], source_snapshot: { forbidden: true } }];
    } };
    const audit = { recordOperationRequired: async (entry: { method: string }) => { audits++; assert.equal(entry.method, "GET"); } };
    const service = Reflect.construct(HrInsurancePreviewService, [db, audit]) as HrInsurancePreviewService;
    const result = await service.listPolicies(scope, actor, { page: 2, page_size: 20, keyword: "FIXTURE" });
    assert.equal(reads, 2); assert.equal(audits, 1); assert.equal(result.total, empty ? 0 : 25);
    assert.deepEqual(result.insuranceKinds, [...HR_INSURANCE_KINDS]);
    if (!empty) assert.deepEqual(Object.keys(result.items[0]!), ["id", "code", "name", "version", "status", "availableVariants"]);
    await assert.rejects(service.listPolicies(scope, { ...actor, permissions: [HR_PERMISSIONS.HR_INSURANCE_TEAM_READ] }, { page: 1, page_size: 20 }), /FORBIDDEN/u);
    assert.equal(reads, 2);
    await assert.rejects(service.listPolicies(scope, actor, { page: 1, page_size: 101 }), /QUERY_INVALID/u);
  }
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, HrInsurancePreviewController.prototype.policies), actor.permissions);
});
