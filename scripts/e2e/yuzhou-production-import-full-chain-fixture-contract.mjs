import assert from "node:assert/strict";
import test from "node:test";
import { makeFixture } from "./production-import-full-chain-test-fixture.mjs";
import { computeProductionImportTouchedPhaseBefore, computeProductionImportTouchedPhaseState } from "../hr-cutover/production-import-phase-state.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL } from "../hr-cutover/production-import-target-model.mjs";
import { computeSealedProductionImportPlanHash, computeProductionImportPayloadHash, validateSealedProductionImportPlan } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

test("full-chain PG fixture prepares exact touched before/after before authorization and sealing", () => {
  const now = new Date("2026-09-09T01:00:00.000Z"), f = makeFixture(1, now);
  const all = new Map(f.records.map(r => [r.sourceIdentitySha256, r]));
  for (const phase of f.plan.phases) {
    const before = [], after = [], absent = [];
    for (const r of phase.records) {
      if (r.disposition === "quarantine") continue;
      const source = all.get(r.sourceIdentitySha256), rule = MODEL.targetTables[r.targetTable];
      const derivedFields = Object.fromEntries(rule.foreignKeys.map(fk => {
        const ref = r.dependencyRefs.find(ref => ref.role === fk.dependencyRole);
        return [fk.column, ref ? all.get(ref.sourceIdentitySha256).targetId : null];
      }));
      after.push({ targetTable: r.targetTable, targetId: r.targetId, version: r.targetVersionAfter, payload: source.payload, derivedFields });
      if (r.disposition === "insert") absent.push({ targetTable: r.targetTable, targetId: r.targetId });
      else before.push({ targetTable: r.targetTable, targetId: r.targetId, version: r.expectedTargetVersionBefore, payload: r.targetTable === "sys_org" ? f.orgBeforePayload : source.payload, derivedFields });
    }
    assert.equal(phase.beforeCanonicalSha256, computeProductionImportTouchedPhaseBefore({ phase: phase.phase, targetScope: f.targetScope, rows: before, absent }));
    assert.equal(phase.expectedAfterCanonicalSha256, computeProductionImportTouchedPhaseState({ phase: phase.phase, targetScope: f.targetScope, rows: after }));
    assert.equal(after.length + phase.records.filter(r => r.disposition === "quarantine").length, phase.records.length);
  }
  assert.equal(f.plan.manifestSha256, computeProductionImportPayloadHash({ triple: f.plan.triple, target: f.plan.target, targetScope: f.targetScope, phases: f.plan.phases }));
  assert.equal(f.plan.authorization.binding.manifestSha256, f.plan.manifestSha256);
  assert.equal(f.plan.sealing.sealedPlanSha256, computeSealedProductionImportPlanHash(f.plan));
  assert.equal(f.rollbackAuthorization.sealedPlanSha256, f.plan.sealing.sealedPlanSha256);
  assert.equal(validateSealedProductionImportPlan(f.plan, { now }).phases.length, 4);
  assert.equal(new Set(f.records.map(r => r.plannedTargetTable)).size, 16);
});

test("full-chain fixture baseline and projected field drift change independent phase evidence", () => {
  const f = makeFixture(2, new Date("2026-09-09T01:00:00.000Z"));
  const t0 = f.plan.phases[0];
  const baseline = { targetTable: f.org.targetTable, targetId: f.org.targetId, version: 3, payload: { ...f.orgBeforePayload, org_name: "drift" }, derivedFields: { parent_id: null } };
  const absent = t0.records.filter(r => r.disposition === "insert").map(r => ({ targetTable: r.targetTable, targetId: r.targetId }));
  assert.notEqual(t0.beforeCanonicalSha256, computeProductionImportTouchedPhaseBefore({ phase: "T0", targetScope: f.targetScope, rows: [baseline], absent }));
  f.plan.phases[0].expectedAfterCanonicalSha256 = "a".repeat(64);
  assert.notEqual(f.plan.sealing.sealedPlanSha256, computeSealedProductionImportPlanHash(f.plan));
});

test("only SQL bigint size_bytes accepts exact bounded integer text; unsafe numbers and overflow fail", () => {
  const f = makeFixture(3, new Date("2026-09-09T01:00:00.000Z"));
  const record = f.records.find(r => r.targetTable === "hr_contract_legacy_evidence");
  assert.equal(record.payload.size_bytes, "9223372036854775806");
  const byId = new Map(f.records.map(r => [r.sourceIdentitySha256, r]));
  const derivedFields = Object.fromEntries(MODEL.targetTables[record.targetTable].foreignKeys.map(fk => [fk.column, byId.get(record.dependencyRefs.find(ref => ref.role === fk.dependencyRole).sourceIdentitySha256).targetId]));
  const state = size => computeProductionImportTouchedPhaseState({ phase: "T2", targetScope: f.targetScope, rows: [{ targetTable: record.targetTable, targetId: record.targetId, version: 1, payload: { ...record.payload, size_bytes: size }, derivedFields }] });
  assert.match(state("9223372036854775806"), /^[a-f0-9]{64}$/u);
  assert.equal(state(42), state("42"));
  for (const invalid of [Number.MAX_SAFE_INTEGER + 1, "9223372036854775808", "-9223372036854775809", "01", "1.0", "1e3", " 1", "", true]) assert.throws(() => state(invalid));
  const org = f.records.find(r => r.targetTable === "sys_org");
  assert.throws(() => computeProductionImportTouchedPhaseState({ phase: "T0", targetScope: f.targetScope, rows: [{ targetTable: "sys_org", targetId: org.targetId, version: 4, payload: { ...org.payload, sort_order: "1" }, derivedFields: { parent_id: null } }] }));
});
