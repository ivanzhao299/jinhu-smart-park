import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { HrInsurancePreviewService } from "./hr-insurance-preview.service";

const enabled = process.env.HR_INSURANCE_PREVIEW_PG === "1";
const scope = { tenantId: "insurance-preview-fixture", parkId: "insurance-preview-fixture" };
const ids = Object.fromEntries(["employee", "policy", "foreignEmployee", "foreignPolicy"].map(key => [key, randomUUID()]));
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic-preview", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ] };
let db: DataSource;
function request() {
  return { policyId: ids.policy!, employeeId: ids.employee!, expectedPolicyVersion: 1, variantNo: 1, periodYear: 2026, periodMonth: 7, includeFund: false, bases: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, contributionBase: "1.00" })) };
}
function service(auditFails = false) {
  return new HrInsurancePreviewService(db, { recordOperationRequired: async (input: { afterJson: unknown }) => {
    if (auditFails) throw new Error("synthetic audit unavailable");
    await db.query("INSERT INTO insurance_preview_fixture_audit(payload) VALUES($1)", [JSON.stringify(input.afterJson)]);
  } } as unknown as AuditService);
}
async function factsHash() {
  return (await db.query(`SELECT md5(string_agg(value,'|' ORDER BY value)) AS hash FROM (
    SELECT row_to_json(e)::text AS value FROM hr_employee e WHERE tenant_id IN($1,'foreign-insurance-fixture')
    UNION ALL SELECT row_to_json(p)::text FROM hr_insurance_policy p WHERE tenant_id IN($1,'foreign-insurance-fixture')
    UNION ALL SELECT row_to_json(i)::text FROM hr_insurance_policy_item i WHERE tenant_id=$1
  ) facts`, [scope.tenantId]))[0].hash as string;
}

before(async () => {
  if (!enabled) return;
  assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(process.env.HR_INSURANCE_PREVIEW_ISOLATED, "yes");
  db = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, entities: [], synchronize: false });
  await db.initialize();
  await db.query("CREATE TABLE insurance_preview_fixture_audit(payload jsonb NOT NULL)");
  for (const [employee, policy, tenant, park] of [[ids.employee, ids.policy, scope.tenantId, scope.parkId], [ids.foreignEmployee, ids.foreignPolicy, "foreign-insurance-fixture", "foreign-insurance-fixture"]]) {
    await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name) VALUES($1,$2,$3,'FIXTURE','合成员工')", [employee, tenant, park]);
    await db.query("INSERT INTO hr_insurance_policy(id,tenant_id,park_id,policy_code,policy_name) VALUES($1,$2,$3,'FIXTURE','合成政策')", [policy, tenant, park]);
  }
  for (const kind of HR_INSURANCE_KINDS) {
    await db.query("INSERT INTO hr_insurance_policy_item(tenant_id,park_id,policy_id,insurance_kind,variant_no,base_rate,employer_rate,employee_rate,supplement_rate,base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount) VALUES($1,$2,$3,$4,1,0.004,0.004,0.004,0.004,0.004,0.004,0.004,0.004)", [scope.tenantId, scope.parkId, ids.policy, kind]);
  }
});
after(async () => { if (db?.isInitialized) await db.destroy(); });

test("original-schema preview matches PostgreSQL numeric rounding and preserves source rows", { skip: !enabled }, async () => {
  const before = await factsHash(); const result = await service().referencePreview(scope, actor, request());
  const expected = (await db.query("SELECT (round(1.00::numeric*0.004::numeric+0.004::numeric,2)*5)::numeric(18,2)::text AS amount"))[0].amount;
  assert.equal(result.calculation.totals.employee, expected); assert.equal(expected, "0.05");
  assert.equal(result.confirmationEligible, false); assert.equal(await factsHash(), before);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM insurance_preview_fixture_audit"))[0].n, 1);
  const reversed = await service().referencePreview(scope, actor, { ...request(), bases: [...request().bases].reverse() });
  assert.equal(reversed.inputHash, result.inputHash);
  const changed = await service().referencePreview(scope, actor, { ...request(), periodMonth: 8 });
  assert.notEqual(changed.inputHash, result.inputHash);
});

test("original-schema foreign sources, stale version and audit failure reject without mutation", { skip: !enabled }, async () => {
  const before = await factsHash();
  await assert.rejects(service().referencePreview(scope, actor, { ...request(), employeeId: ids.foreignEmployee! }), /SOURCE_NOT_FOUND/u);
  await assert.rejects(service().referencePreview(scope, actor, { ...request(), policyId: ids.foreignPolicy! }), /SOURCE_NOT_FOUND/u);
  await assert.rejects(service().referencePreview(scope, actor, { ...request(), expectedPolicyVersion: 2 }), /VERSION_CHANGED/u);
  await assert.rejects(service(true).referencePreview(scope, actor, request()), /audit unavailable/u);
  assert.equal(await factsHash(), before);
});
