import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { insuranceSourceFactorsHash } from "./hr-insurance-policy-source";
import { HrInsurancePreviewService } from "./hr-insurance-preview.service";

const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const id = "11111111-1111-4111-8111-111111111111";
const actor: JwtPrincipal = { ...scope, sub: "fixture-actor", username: "fixture", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ] };

function harness(options: { missing?: boolean; stale?: boolean; nullRate?: boolean; auditFails?: boolean } = {}) {
  let transactions = 0, audits = 0;
  const rows = [...HR_INSURANCE_KINDS].sort().map((insurance_kind, i) => ({ id: `factor-${i}`, version: 1, insurance_kind, base_rate: "0.100000", employer_rate: "0.200000", employee_rate: options.nullRate ? null : "0.080000", supplement_rate: "0.000000", base_fixed_amount: null, employer_fixed_amount: "-1.250", employee_fixed_amount: null, supplement_fixed_amount: null }));
  const db = { transaction: async (isolation: string, fn: (manager: unknown) => Promise<unknown>) => {
    transactions++; assert.equal(isolation, "REPEATABLE READ");
    let readonly = false;
    return fn({ query: async (sql: string, params?: unknown[]) => {
      if (sql === "SET TRANSACTION READ ONLY") { readonly = true; return []; }
      assert.ok(readonly);
      if (sql.startsWith("SET LOCAL ")) return [];
      assert.match(sql, /^SELECT /u);
      assert.match(sql, /tenant_id=\$2 AND park_id=\$3/u);
      assert.match(sql, /AND is_deleted=false/u);
      assert.deepEqual(params?.slice(0, 3), [id, scope.tenantId, scope.parkId]);
      assert.doesNotMatch(sql, /FOR (SHARE|UPDATE)|source_snapshot/u);
      if (sql.includes("FROM hr_insurance_policy ")) return options.missing ? [] : [{ id, policy_code: "FIXTURE", policy_name: "合成政策", version: options.stale ? 2 : 1, status: "historical", scope_description: "原范围待核对", source_snapshot: "must not escape" }];
      return params?.[3] === 1 ? rows : [];
    } });
  } };
  const audit = { recordOperationRequired: async (entry: { afterJson: unknown }) => {
    audits++; if (options.auditFails) throw new Error("fixture audit unavailable");
    assert.doesNotMatch(JSON.stringify(entry.afterJson), /0\.200000|-1\.250|原范围/u);
  } };
  return { service: Reflect.construct(HrInsurancePreviewService, [db, audit]) as HrInsurancePreviewService, rows, transactions: () => transactions, audits: () => audits };
}

test("historical definition preserves exact rates, NULL offsets and source scope without leaking raw rows", async () => {
  const h = harness(); const result = await h.service.policyDefinition(scope, actor, id, 1);
  assert.equal(result.scopeDescription, "原范围待核对"); assert.equal(result.activated, false);
  assert.equal(result.variants.length, 1); const variant = result.variants[0]!;
  assert.equal(variant.copyEligible, true); assert.equal(variant.items.length, 6);
  assert.equal(variant.items[0]!.factors.base.fixedAmount, null);
  assert.equal(variant.items[0]!.factors.employer.fixedAmount, "-1.250");
  assert.equal(variant.factorsHash, insuranceSourceFactorsHash(h.rows));
  assert.notEqual(variant.factorsHash, insuranceSourceFactorsHash(h.rows.map((r, i) => i === 0 ? { ...r, version: 2 } : r)));
  assert.doesNotMatch(JSON.stringify(result), /source_snapshot|factor-0|must not escape/u);
  assert.equal(h.audits(), 1);
});

test("missing historical rates remain visible but prohibit copying a policy", async () => {
  const h = harness({ nullRate: true }); const result = await h.service.policyDefinition(scope, actor, id, 1);
  assert.equal(result.variants[0]!.copyEligible, false);
  assert.equal(result.variants[0]!.items[0]!.factors.employee.rate, null);
});

test("authority and input failures precede database reads; stale and foreign sources do not return", async () => {
  const h = harness();
  await assert.rejects(h.service.policyDefinition(scope, { ...actor, permissions: actor.permissions.slice(0, 2) }, id, 1), /FORBIDDEN/u);
  await assert.rejects(h.service.policyDefinition(scope, actor, "invalid", 1), /INPUT_INVALID/u);
  await assert.rejects(h.service.policyDefinition(scope, actor, id, 0), /INPUT_INVALID/u);
  assert.equal(h.transactions(), 0);
  for (const [options, error] of [[{ missing: true }, /SOURCE_NOT_FOUND/u], [{ stale: true }, /SOURCE_CHANGED/u]] as const) {
    const source = harness(options); await assert.rejects(source.service.policyDefinition(scope, actor, id, 1), error); assert.equal(source.audits(), 0);
  }
});

test("required read audit failure withholds the historical financial definition", async () => {
  await assert.rejects(harness({ auditFails: true }).service.policyDefinition(scope, actor, id, 1), /audit unavailable/u);
});
