import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { adaptT5NonfileSkillStage, ProductionImportT5NonfileStageAdapterError } from "../hr-cutover/production-import-t5-nonfile-stage-adapter.mjs";

const h = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") };
const stageManifest = { sourceSnapshotHash: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: h("restore"), nonfileBusinessSha256: h("business"), productionImport: "HOLD" };
const skill = (suffix, employeeCode = "E-001", disposition = "loaded") => ({
  domain: "skill", employeeCode, sourceTable: "dbo.knowhow", sourceKey: suffix, sourceIdentitySha256: h(`identity:${suffix}`), sourceRowSha256: h(`row:${suffix}`),
  materialized: { disposition, gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: `skill-${suffix}` },
});

test("adapts reviewed T5 skills with exact T0 employee dependencies and quarantines unmapped rows", () => {
  const output = adaptT5NonfileSkillStage({ triple, stageManifest, employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("employee") }], records: [skill("one"), skill("two", "E-002")] });
  assert.equal(output.phase, "T5");
  assert.equal(output.productionImport, "HOLD");
  assert.equal(output.records[0].disposition, "insert");
  assert.deepEqual(output.records[0].dependencyRefs, [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: h("employee") }]);
  assert.equal(output.records[1].disposition, "quarantine");
  assert.equal(output.records[1].quarantineReason, "EMPLOYEE_NOT_MAPPED");
});

test("rejects stage drift and cannot silently map an ambiguous employee index", () => {
  assert.throws(() => adaptT5NonfileSkillStage({ triple, stageManifest: { ...stageManifest, sourceSnapshotHash: h("other") }, employeeIndex: [], records: [] }), ProductionImportT5NonfileStageAdapterError);
  assert.throws(() => adaptT5NonfileSkillStage({ triple, stageManifest, employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("one") }, { employeeCode: "E-001", sourceIdentitySha256: h("two") }], records: [skill("one")] }), ProductionImportT5NonfileStageAdapterError);
});
