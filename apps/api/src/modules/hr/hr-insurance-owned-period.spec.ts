import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import { HR_INSURANCE_OWNED_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import { HR_INSURANCE_KINDS, calculateInsurancePreview } from "./hr-insurance-calculation";
import { HrInsuranceOwnedPeriodController } from "./hr-insurance-owned-period.controller";
import { HrInsuranceOwnedPeriodService } from "./hr-insurance-owned-period.service";
import type { CreateHrInsuranceOwnedPreviewDto } from "./dto/hr-insurance-owned-period.dto";

const scope = { tenantId: randomUUID(), parkId: randomUUID() };
const reads = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [...reads, ...Object.values(HR_INSURANCE_OWNED_PERMISSIONS)] };
const hash = "a".repeat(64);
const request = (): CreateHrInsuranceOwnedPreviewDto => ({ requestId: randomUUID(), employeeId: randomUUID(), expectedEmployeeVersion: 7,
  policyVersionId: randomUUID(), expectedDefinitionHash: hash, periodMonth: "2026-10", includeFund: false,
  bases: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, contributionBase: "0010" })) });
const items = HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, factors: {
  base: { rate: "0.01", fixedAmount: null }, employer: { rate: "0.01", fixedAmount: null }, employee: { rate: "0.01", fixedAmount: null }, supplement: { rate: "0.01", fixedAmount: null } } }));

test("owned period routes declare read scope, independent writes, replay interceptor and no body audit", () => {
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, HrInsuranceOwnedPeriodController), reads);
  for (const [action, capability] of [["preview", "PREVIEW_CREATE"], ["confirm", "CONFIRM"], ["close", "CLOSE"], ["correct", "CORRECT"]] as const) {
    const handler = HrInsuranceOwnedPeriodController.prototype[action];
    assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), [...reads, HR_INSURANCE_OWNED_PERMISSIONS[capability]]);
    assert.ok(Reflect.getMetadata(INTERCEPTORS_METADATA, handler).some((i: unknown) => i instanceof IdempotencyInterceptor));
  }
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY, HrInsuranceOwnedPeriodController).captureBody, false);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, HrInsuranceOwnedPeriodController.prototype.employeeOptions), [...reads, HR_INSURANCE_OWNED_PERMISSIONS.PREVIEW_CREATE]);
});

test("every period action checks independent authority before querying protected identities", async () => {
  let probes = 0;
  const service = Reflect.construct(HrInsuranceOwnedPeriodService, [{ transaction: () => { probes++; } }, {}]) as HrInsuranceOwnedPeriodService;
  const reader = { ...actor, permissions: reads };
  const confirm = { requestId: randomUUID(), previewId: randomUUID(), expectedPreviewHash: hash, reason: "合成测试" };
  await assert.rejects(service.preview(scope, reader, request()), /FORBIDDEN/u);
  await assert.rejects(service.employeeOptions(scope, reader, { page: 1, page_size: 20 }), /FORBIDDEN/u);
  await assert.rejects(service.confirm(scope, reader, confirm), /FORBIDDEN/u);
  await assert.rejects(service.correct(scope, reader, { ...confirm, previousRevisionId: randomUUID(), expectedPeriodVersion: 1 }), /FORBIDDEN/u);
  await assert.rejects(service.close(scope, reader, { requestId: randomUUID(), revisionId: randomUUID(), expectedPeriodVersion: 1, reason: "合成测试" }), /FORBIDDEN/u);
  await assert.rejects(service.detail(scope, { ...reader, permissions: reads.slice(0, 2) }, randomUUID()), /FORBIDDEN/u);
  await assert.rejects(service.list(scope, { ...reader, permissions: reads.slice(0, 2) }, { page: 1, page_size: 20 }), /FORBIDDEN/u);
  assert.equal(probes, 0);
});

test("preview resolves server factors, canonicalizes bases, unwraps DML rows and audits on its manager", async () => {
  const dto = request(), previewId = randomUUID();
  let audits = 0, inserts = 0;
  const manager = { query: async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO hr_insurance_owned_preview")) {
      inserts++;
      const snapshot = JSON.parse(params[11] as string), result = JSON.parse(params[12] as string);
      assert.deepEqual(snapshot.bases, HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, contributionBase: "10.00" })));
      assert.equal(result.totals.employee, "0.50");
      assert.equal(snapshot.includeFund, false);
      return [[{ id: previewId, employee_id: dto.employeeId, employee_version: 7, policy_version_id: dto.policyVersionId,
        period_month: dto.periodMonth, include_fund: false, created_by: actor.sub, request_sha256: params[3],
        expires_at: new Date("2026-10-03T00:20:00Z"), snapshot_sha256: hash, result }], 1];
    }
    if (sql.includes("FROM hr_employee ")) return [{ id: dto.employeeId, version: 7, employment_status: "active" }];
    if (sql.includes("FROM hr_insurance_policy_version ")) return [{ version_no: 1, definition_sha256: hash, effective_from: "2026-01", effective_through: "2026-12", definition: { items } }];
    return [];
  } };
  const audit = { recordOperationRequired: async (entry: { afterJson: unknown }, received: unknown) => {
    assert.equal(received, manager); audits++;
    assert.deepEqual(entry.afterJson, { snapshotHash: hash, replayed: false, fieldGroups: ["insurance", "financial"] });
  } };
  const service = Reflect.construct(HrInsuranceOwnedPeriodService, [{ transaction: async (_isolation: string, run: (m: unknown) => Promise<unknown>) => run(manager) }, audit]) as HrInsuranceOwnedPeriodService;
  assert.equal((await service.preview(scope, actor, dto)).id, previewId);
  assert.equal(inserts, 1); assert.equal(audits, 1);
});

test("durable preview replay precedes expiry and employee drift; changed content conflicts", async () => {
  const dto = request(), id = randomUUID();
  let requestHash: unknown, auditFail = false, audits = 0;
  const result = calculateInsurancePreview({ policyVersion: 1, includeFund: false, items: items.map(i => ({ ...i, contributionBase: "10.00" })) });
  const manager = { query: async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("INSERT")) {
      requestHash = params[3];
      return [[{ id, employee_id: dto.employeeId, employee_version: 7, policy_version_id: dto.policyVersionId,
        period_month: dto.periodMonth, include_fund: false, expires_at: new Date("2000-01-01Z"), snapshot_sha256: hash, result }], 1];
    }
    if (sql.startsWith("SELECT id,created_by,request_sha256")) return requestHash ? [{ id, created_by: actor.sub, request_sha256: requestHash }] : [];
    if (sql.startsWith("SELECT id,employee_id")) return [{ id, employee_id: dto.employeeId, employee_version: 7, policy_version_id: dto.policyVersionId,
      period_month: dto.periodMonth, include_fund: false, expires_at: new Date("2000-01-01Z"), snapshot_sha256: hash, result }];
    if (sql.includes("FROM hr_employee ")) { assert.equal(requestHash, undefined); return [{ version: 7, employment_status: "active" }]; }
    if (sql.includes("FROM hr_insurance_policy_version ")) return [{ version_no: 1, definition_sha256: hash, effective_from: "2026-01", effective_through: "2026-12", definition: { items } }];
    return [];
  } };
  const service = Reflect.construct(HrInsuranceOwnedPeriodService, [{ transaction: async (_isolation: string, run: (m: unknown) => Promise<unknown>) => run(manager) }, { recordOperationRequired: async () => { audits++; if (auditFail) throw new Error("synthetic audit failure"); } }]) as HrInsuranceOwnedPeriodService;
  const first = await service.preview(scope, actor, dto);
  const replay = await service.preview(scope, actor, { ...dto, bases: [...dto.bases].reverse().map(b => ({ ...b, contributionBase: "10.00" })) });
  assert.deepEqual({ ...replay, replayed: false }, first);
  await assert.rejects(service.preview(scope, actor, { ...dto, includeFund: true }), /REQUEST_CONFLICT/u);
  assert.equal(audits, 2);
  auditFail = true;
  await assert.rejects(service.preview(scope, actor, dto), /synthetic audit failure/u);
});

test("confirm, close and correction unwrap returning rows and bind audit to the transaction", async () => {
  const previewId = randomUUID(), employeeId = randomUUID(), firstId = randomUUID(), nextId = randomUUID(), closeId = randomUUID();
  const result = calculateInsurancePreview({ policyVersion: 1, includeFund: false, items: items.map(i => ({ ...i, contributionBase: "10.00" })) });
  const first = { id: firstId, employee_id: employeeId, period_month: "2026-10", revision_no: 1, preview_id: previewId, previous_revision_id: null, snapshot_sha256: hash, result };
  const second = { ...first, id: nextId, revision_no: 2, previous_revision_id: firstId };
  const writes: string[] = [], audits: string[] = [];
  const manager = { query: async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO hr_insurance_owned_revision")) {
      assert.deepEqual(params.slice(0, 4), [scope.tenantId, scope.parkId, employeeId, "2026-10-01"]);
      writes.push(params[4] === 1 ? "confirm" : "correct");
      if (params[4] === 2) { assert.equal(params[6], firstId); assert.equal(params[10], "合成更正"); }
      return [[{ id: params[4] === 1 ? firstId : nextId }], 1];
    }
    if (sql.startsWith("INSERT INTO hr_insurance_owned_close")) {
      assert.equal(params[2], firstId); writes.push("close"); return [[{ id: closeId }], 1];
    }
    if (sql.startsWith("SELECT id,employee_id")) return [{ id: previewId, employee_id: employeeId, period_month: "2026-10", snapshot_sha256: hash }];
    if (sql.startsWith("SELECT r.id")) return [params[0] === nextId ? second : first];
    return [];
  } };
  const service = Reflect.construct(HrInsuranceOwnedPeriodService, [{ transaction: async (_isolation: string, run: (m: unknown) => Promise<unknown>) => run(manager) }, {
    recordOperationRequired: async (entry: { action: string; afterJson: unknown }, received: unknown) => {
      assert.equal(received, manager); audits.push(entry.action);
      assert.deepEqual(entry.afterJson, { snapshotHash: hash, replayed: false, fieldGroups: ["insurance", "financial"] });
    }
  }]) as HrInsuranceOwnedPeriodService;
  const confirmed = await service.confirm(scope, actor, { requestId: randomUUID(), previewId, expectedPreviewHash: hash, reason: "合成确认" });
  assert.equal(confirmed.id, firstId);
  const closed = await service.close(scope, actor, { requestId: randomUUID(), revisionId: firstId, expectedPeriodVersion: 1, reason: "合成关账" });
  assert.equal(closed.id, closeId);
  const corrected = await service.correct(scope, actor, { requestId: randomUUID(), previewId, expectedPreviewHash: hash, previousRevisionId: firstId, expectedPeriodVersion: 1, reason: " 合成更正 " });
  assert.equal(corrected.previousRevisionId, firstId); assert.equal(corrected.revisionNo, 2);
  assert.deepEqual(writes, ["confirm", "close", "correct"]); assert.deepEqual(audits, writes);
});
