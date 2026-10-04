import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { createInsurancePolicyInTransaction, insurancePolicyFlatFacts, normalizeInsurancePolicyFacts, planInsurancePolicyFacts } from "./hr-yuzhou-insurance-policy-transaction";
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const actor: JwtPrincipal = { ...scope, sub: "11111111-1111-4111-8111-111111111111", username: "fixture", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE] };
const facts = () => ({ name: null, scopeDescription: "原范围待核对", items: ["oldage", "remedy", "losework", "fund", "wound", "bear"].map(kind => ({ kind, variant: 1, baseRate: null, employerRate: "0.125000", employeeRate: "0", supplementRate: "1", baseFixedAmount: null, employerFixedAmount: "-1.250", employeeFixedAmount: "0", supplementFixedAmount: "1" })) });
test("target numeric precision rejects overflow without rounding and retains NULL", () => {
  const input = facts(), normalized = normalizeInsurancePolicyFacts(input);
  assert.equal(normalized.items[0]!.baseRate, null);
  assert.equal(normalized.items[0]!.employerFixedAmount, "-1.25");
  for (const [field, value] of [["employerRate", "1000000000000"], ["employeeRate", "0.0000001"], ["baseFixedAmount", "1.0001"], ["employeeRate", "-0.01"], ["employeeRate", 0.1]] as const) {
    const invalid = facts(); Object.assign(invalid.items[0]!, { [field]: value });
    assert.throws(() => normalizeInsurancePolicyFacts(invalid), /FACTS_INVALID/u);
  }
  const duplicate = facts(); duplicate.items[5]!.kind = "oldage";
  assert.throws(() => normalizeInsurancePolicyFacts(duplicate), /FACTS_INVALID/u);
  assert.throws(() => normalizeInsurancePolicyFacts({ ...facts(), activated: true }), /FACTS_INVALID/u);
});
test("field-level three-way comparison preserves modern edits and rejects divergent changes", () => {
  const original = facts(), source = insurancePolicyFlatFacts(original), modern = facts(); modern.items[0]!.employeeRate = "0.2";
  assert.equal(planInsurancePolicyFacts(original, source, modern, source).action, "unchanged");
  const incoming = facts(); incoming.items[0]!.employerRate = "0.15";
  const plan = planInsurancePolicyFacts(incoming, source, modern, source);
  assert.deepEqual(plan.updates, { "oldage.employerRate": "0.15" });
  incoming.items[0]!.employeeRate = "0.3";
  assert.deepEqual(planInsurancePolicyFacts(incoming, source, modern, source).conflictFields, ["oldage.employeeRate"]);
  incoming.items[0]!.employeeRate = "0.2";
  assert.equal(planInsurancePolicyFacts(incoming, source, modern, source).action, "update");
  assert.deepEqual(planInsurancePolicyFacts(incoming, {}, modern, source).updates, {});
});
test("formal primitive requires transaction, scope and complete authority before writes", async () => {
  let calls = 0;
  const manager = { queryRunner: { isTransactionActive: true }, query: async () => { calls++; return [{ id: actor.sub, version: 1 }]; } } as unknown as EntityManager;
  for (const denied of [{ ...actor, parkId: "foreign" }, { ...actor, permissions: actor.permissions.slice(0, 2) }, { ...actor, sub: "invalid" }]) await assert.rejects(createInsurancePolicyInTransaction(manager, scope, denied, `sha256:${"a".repeat(64)}`, facts()));
  assert.equal(calls, 0);
  await assert.rejects(createInsurancePolicyInTransaction({ queryRunner: { isTransactionActive: false } } as EntityManager, scope, actor, `sha256:${"a".repeat(64)}`, facts()), /TRANSACTION_REQUIRED/u);
});
test("formal primitive creates scoped reference and six items without activation or financial posting", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const manager = { queryRunner: { isTransactionActive: true }, query: async (sql: string, values: unknown[]) => { queries.push({ sql, values }); return [{ id: actor.sub, version: 1 }]; } } as unknown as EntityManager;
  const result = await createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"a".repeat(64)}`, facts());
  assert.equal(result.activated, false); assert.equal(queries.length, 7);
  assert.equal((queries[0]!.values[2] as string).length, 64);
  for (const { sql, values } of queries) { assert.deepEqual(values.slice(0, 2), [scope.tenantId, scope.parkId]); assert.doesNotMatch(sql, /hr_employee_insurance|owned_period|payroll|UPDATE|DELETE/u); }
  assert.deepEqual(queries[1]!.values.slice(4, 12), [null, "0.125", "0", "1", null, "-1.25", "0", "1"]);
});
