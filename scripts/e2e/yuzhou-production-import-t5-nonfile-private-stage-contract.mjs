import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createT5NonfilePrivateStage, ProductionImportT5NonfilePrivateStageError } from "../hr-cutover/production-import-t5-nonfile-private-stage.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
const manifest = { artifactKind: "yuzhou_t5_nonfile_materialization_stage", sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("restore"), nonfileBusinessSha256: hash("business"), domains: { family: {}, knowhow: {}, person_core: {}, ticket: {} }, filesExcluded: ["photo", "docs"], productionImport: "HOLD" };
const source = hash("skill-source");
const row = {
  domain: "skill", employeeCode: "E-001", sourceTable: "dbo.knowhow", sourceKey: "one", sourceIdentitySha256: source, sourceRowSha256: hash("skill-row"), source: { legacyOnly: true },
  materialized: { disposition: "loaded", gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: "synthetic" },
};

test("builds a sealed private T5 stage and an aggregate-only receipt", () => {
  const output = createT5NonfilePrivateStage({ triple, stageManifest: manifest, employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: hash("employee") }], records: [row] });
  assert.equal(output.privateStage.records.length, 1);
  assert.equal(Object.hasOwn(output.privateStage.records[0], "source"), false);
  assert.match(output.receipt.privateStageSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(output.receipt.targetTableCounts).sort(), ["hr_employee_credential", "hr_employee_family", "hr_employee_profile", "hr_employee_skill"]);
  assert.equal(output.receipt.targetTableCounts.hr_employee_skill.insert, 1);
  assert.equal(output.receipt.productionImport, "HOLD");
});

test("rejects a stage with a mismatched source binding before a private artifact exists", () => {
  assert.throws(() => createT5NonfilePrivateStage({ triple, stageManifest: { ...manifest, sourceSnapshotSha256: hash("other") }, employeeIndex: [], records: [] }), ProductionImportT5NonfilePrivateStageError);
});
