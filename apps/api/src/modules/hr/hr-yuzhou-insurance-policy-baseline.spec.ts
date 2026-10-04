import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { canonicalYuzhouInitialJson } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { verifyInsurancePolicyOriginalBaseline, type InsurancePolicyOriginalWitness } from "./hr-yuzhou-insurance-policy-baseline";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const canonical = canonicalYuzhouInitialJson;
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const slots = [["", "base"], ["_e", "employer"], ["_p", "employee"], ["_pc", "supplement"]];
function fixture(options: { staleReceipt?: boolean; wrongDependency?: boolean; ambiguousMap?: boolean; legacyUnits?: boolean } = {}) {
  const identity = hash("dbo.insure_method\0" + 7), targetId = randomUUID(), operationId = "synthetic-policy-original";
  const source = { id: 7, des: "synthetic", rightscope: null, ...Object.fromEntries(kinds.flatMap(kind => slots.flatMap(([suffix]) => [[`${kind}${suffix}`, "12.500"], [`${kind}${suffix}2`, "-1.250"]]))) };
  const sourceHash = hash(canonical(source));
  const parent = { ...scope, tenant_id: scope.tenantId, park_id: scope.parkId, policy_code: "YUZHOU-7", policy_name: source.des, scope_description: null, status: "historical", is_historical_import: true, remark: null };
  delete (parent as Partial<typeof parent>).tenantId; delete (parent as Partial<typeof parent>).parkId;
  const witness: InsurancePolicyOriginalWitness = { operationId, source, policy: { targetId, projection: parent }, items: kinds.map(kind => ({ targetId: randomUUID(), projection: { tenant_id: scope.tenantId, park_id: scope.parkId, policy_id: targetId, insurance_kind: kind, variant_no: 1, ...Object.fromEntries(slots.flatMap(([, component]) => [[`${component}_rate`, options.legacyUnits ? "12.500000" : "0.125000"], [`${component}_fixed_amount`, "-1.250"]])), source_snapshot: { sourceRowSha256: sourceHash }, remark: null } })) };
  const receipts = new Map<string, Record<string, unknown>>();
  receipts.set(identity, { operation_id: operationId, phase: "T3", source_table: "dbo.insure_method", source_pk_canonical: `sha256:${identity}`, source_identity_sha256: identity, target_table: "hr_insurance_policy", target_id: targetId, source_row_sha256: sourceHash, target_after_sha256: hash(`yuzhou-hr-production-target-canonical-sha256-v1\0hr_insurance_policy\0${canonical(parent)}`), target_version_after: 1 });
  for (const item of witness.items) {
    const discriminator = `${item.projection.insurance_kind}\0${1}`, child = hash(`yuzhou-hr-production-source-projection-v1\0${identity}\0hr_insurance_policy_item\0${discriminator}`);
    receipts.set(child, { operation_id: operationId, phase: "T3", source_table: "dbo.insure_method", source_pk_canonical: `sha256:${child}`, source_identity_sha256: child, target_table: "hr_insurance_policy_item", target_id: item.targetId, source_row_sha256: hash(canonical({ parentSourceRowSha256: sourceHash, discriminator })), target_after_sha256: hash(`yuzhou-hr-production-target-canonical-sha256-v1\0hr_insurance_policy_item\0${canonical(item.projection)}`), target_version_after: 1 });
  }
  let queries = 0;
  const manager = { queryRunner: { isTransactionActive: true }, query: async (sql: string, params: unknown[]) => {
    queries++; assert.doesNotMatch(sql, /INSERT|UPDATE\s+\w+|DELETE/u);
    if (sql.includes("SELECT r.*")) { assert.equal(params[0], operationId); assert.equal(params[1], "T3"); assert.deepEqual(params.slice(3, 5), [scope.tenantId, scope.parkId]); return options.staleReceipt ? [] : [receipts.get(String(params[2]))]; }
    if (sql.includes("SELECT id FROM legacy_record_map")) return options.ambiguousMap ? [{ id: randomUUID() }, { id: randomUUID() }] : [{ id: randomUUID() }];
    if (sql.includes("record_dependency")) return [{ dependency_role: "policy", depends_on_phase: "T3", depends_on_source_identity_sha256: options.wrongDependency ? "0".repeat(64) : identity, expected_target_table: "hr_insurance_policy" }];
    throw new Error("unexpected fixture query");
  } } as unknown as EntityManager;
  return { manager, witness, key: `sha256:${identity}`, queries: () => queries };
}
test("seven bound receipts and original51 fields establish baselines without reading modern values", async () => {
  const f = fixture(), before = canonical(f.witness);
  const result = await verifyInsurancePolicyOriginalBaseline(f.manager, scope, f.key, f.witness);
  assert.equal(result.source["oldage.baseRate"], "0.125"); assert.equal(result.source["oldage.baseFixedAmount"], "-1.25");
  assert.equal(result.source.scopeDescription, null); assert.deepEqual(result.source, result.target);
  assert.equal(Object.keys(result.source).length, 50); assert.equal(canonical(f.witness), before); assert.equal(f.queries(), 20);
});
test("tampered raw row, target witness, foreign scope, and missing source fields reject", async () => {
  for (const alter of [
    (w: InsurancePolicyOriginalWitness) => { w.source.oldage = "13.000"; },
    (w: InsurancePolicyOriginalWitness) => { w.items[0]!.projection.base_rate = "0.13"; },
    (w: InsurancePolicyOriginalWitness) => { w.policy.projection.park_id = "foreign"; },
    (w: InsurancePolicyOriginalWitness) => { delete w.source.oldage2; },
    (w: InsurancePolicyOriginalWitness) => { w.items.push(w.items[0]!); },
  ]) { const f = fixture(); alter(f.witness); await assert.rejects(verifyInsurancePolicyOriginalBaseline(f.manager, scope, f.key, f.witness), /ORIGINAL_EVIDENCE_INVALID/u); }
});
test("failed receipt chain, ambiguous active map and foreign policy dependency reject", async () => {
  for (const options of [{ staleReceipt: true }, { ambiguousMap: true }, { wrongDependency: true }]) {
    const f = fixture(options); await assert.rejects(verifyInsurancePolicyOriginalBaseline(f.manager, scope, f.key, f.witness), /ORIGINAL_EVIDENCE_INVALID|INITIAL_BASELINE_ORIGINAL_EVIDENCE_INVALID/u);
  }
});
test("authentic old rate units require recovery rather than silently becoming new baselines", async () => {
  const f = fixture({ legacyUnits: true });
  await assert.rejects(verifyInsurancePolicyOriginalBaseline(f.manager, scope, f.key, f.witness), /ORIGINAL_LAYOUT_REQUIRES_RECOVERY/u);
});
