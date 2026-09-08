import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";
import { makeFixture, verifyFullChainFixtureReadback } from "./production-import-full-chain-test-fixture.mjs";
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

test("independent SQL field readback verifies all 16 tables without writer-returned hashes", async () => {
  const f = makeFixture(4, new Date("2026-09-09T01:00:00.000Z"));
  const byId = new Map(f.records.map(r => [r.sourceIdentitySha256, r])); let count = 0;
  for (const record of f.records.filter(r => r.disposition !== "quarantine")) {
    const rule = MODEL.targetTables[record.targetTable];
    const derived = Object.fromEntries(rule.foreignKeys.map(fk => {
      const ref = record.dependencyRefs.find(r => r.role === fk.dependencyRole);
      return [fk.column, ref ? byId.get(ref.sourceIdentitySha256).targetId : null];
    }));
    await verifyFullChainFixtureReadback({ async query(sql, ids) {
      assert.deepEqual(ids, [record.targetId]);
      for (const date of rule.dateFields) assert.ok(sql.includes(`${date}::text AS ${date}`));
      count += 1; return { rows: [{ ...record.payload, ...derived }] };
    } }, record, f.targetScope);
  }
  assert.equal(count, 16);
});

test("old Date path loses T1 evidence; SQL text is microsecond-exact in UTC and Shanghai", () => {
  const helper = new URL("./production-import-full-chain-test-fixture.mjs", import.meta.url).href;
  const model = new URL("../hr-cutover/production-import-target-model.mjs", import.meta.url).href;
  const code = `
    import assert from 'node:assert/strict';
    import { makeFixture, verifyFullChainFixtureReadback } from ${JSON.stringify(helper)};
    import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportTargetCanonicalHash } from ${JSON.stringify(model)};
    const f=makeFixture(5,new Date('2026-09-09T01:00:00.000Z'));
    for(const table of ['hr_employment_event','hr_contract_change']) {
      const r=f.records.find(r=>r.targetTable===table), field=table==='hr_employment_event'?'source_effective_at':'signed_at';
      const derived=Object.fromEntries(model.targetTables[table].foreignKeys.map(fk=>{const ref=r.dependencyRefs.find(x=>x.role===fk.dependencyRole);return [fk.column,ref?f.records.find(x=>x.sourceIdentitySha256===ref.sourceIdentitySha256).targetId:null];}));
      const row={...r.payload,...derived};
      await verifyFullChainFixtureReadback({async query(sql){assert.ok(sql.includes(table==='hr_employment_event'?'HH24:MI:SS.US':'HH24:MI:SS.MS'));return {rows:[row]};}},r,f.targetScope);
      const date=new Date(r.payload[field]);
      if(table==='hr_employment_event') {
        assert.equal(r.payload[field],'2026-08-29T09:10:11.123456+08:00');
        const pad=n=>String(n).padStart(2,'0');
        const old=date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds())+'.'+String(date.getMilliseconds()).padStart(3,'0');
        assert.notEqual(computeProductionImportTargetCanonicalHash(table,f.targetScope,{...r.payload,[field]:old},derived),r.expectedTargetAfterSha256);
      }
      await assert.rejects(()=>verifyFullChainFixtureReadback({async query(){return {rows:[{...row,[field]:date}]};}},r,f.targetScope));
    }
  `;
  for (const TZ of ["UTC", "Asia/Shanghai"]) execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { TZ }, stdio: "pipe" });
});
