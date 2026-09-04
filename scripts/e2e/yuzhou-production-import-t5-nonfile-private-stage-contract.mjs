import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createT5NonfilePrivateStage, ProductionImportT5NonfilePrivateStageError } from "../hr-cutover/production-import-t5-nonfile-private-stage.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
const manifest = { artifactKind: "yuzhou_t5_nonfile_materialization_stage", sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("restore"), nonfileBusinessSha256: hash("business"), mappingContractSha256: triple.mappingContractHash, definitionEvidenceSha256: hash("definitions"), definitionEvidenceRows: 19, definitionLogicColumnDenominator: 190, definitionLogicColumnPresentCount: 0, t0DecisionArtifactSha256: hash("t0-decisions"), t0TargetIdentitySha256: hash("target"), t0TargetScopeSha256: hash("scope"), domains: { family: {}, knowhow: {}, person_core: {}, ticket: {} }, filesExcluded: ["photo", "docs"], productionImport: "HOLD" };
const definitionEvidence = Array.from({ length: 19 }, (_, index) => {
  const code = index < 9 ? `def${index + 1}` : index < 14 ? `def${index + 2}` : `def${index + 7}`;
  const valueType = index < 9 ? "text" : index < 14 ? "numeric" : "date";
  return { code, valueType, baseClassification: valueType, legacyDefinitionId: String(index + 1), legacyDatatype: valueType, legacyGroupId: null, legacySortOrder: index, legacyNullable: null, legacyRuleClassification: "inert", sourceIdentitySha256: hash(`definition:${index}`), sourceRowSha256: hash(`definition-row:${index}`), legacyLogicCoverage: { denominator: 10, presentCount: 0, nullCount: 10, reviewStatus: "no_legacy_logic_value", columns: [["description_d","presentation_expression"],["sqltext","legacy_sql_expression"],["flag","legacy_behavior_flag"],["crosssql","legacy_cross_lookup_sql"],["crosscolselectsql","legacy_cross_column_sql"],["crossrowselectsql","legacy_cross_row_sql"],["crosswhere","legacy_cross_filter"],["querywhere","legacy_query_filter"],["ascount","legacy_aggregate_flag"],["ascount2","legacy_secondary_aggregate_flag"]].map(([column,classification]) => ({ column, classification, execution: "forbidden", isSourceNull: true, sourceValueSha256: null })) } };
});
const source = hash("skill-source");
const row = {
  domain: "skill", employeeCode: "E-001", sourceTable: "dbo.knowhow", sourceKey: "one", sourceIdentitySha256: source, sourceRowSha256: hash("skill-row"), source: { legacyOnly: true },
  materialized: { disposition: "loaded", gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: "synthetic" },
};

test("builds a sealed private T5 stage and an aggregate-only receipt", () => {
  const output = createT5NonfilePrivateStage({ triple, stageManifest: manifest, definitionEvidence, employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: hash("employee") }], records: [row] });
  assert.equal(output.privateStage.records.length, 1);
  assert.equal(Object.hasOwn(output.privateStage.records[0], "source"), false);
  assert.match(output.receipt.privateStageSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(output.receipt.targetTableCounts).sort(), ["hr_custom_field_definition", "hr_custom_field_legacy_logic_fingerprint", "hr_employee_credential", "hr_employee_custom_value", "hr_employee_family", "hr_employee_profile", "hr_employee_skill"]);
  assert.equal(output.receipt.targetTableCounts.hr_employee_skill.insert, 1);
  assert.equal(output.receipt.productionImport, "HOLD");
});

test("rejects a stage with a mismatched source binding before a private artifact exists", () => {
  assert.throws(() => createT5NonfilePrivateStage({ triple, stageManifest: { ...manifest, sourceSnapshotSha256: hash("other") }, definitionEvidence, employeeIndex: [], records: [] }), ProductionImportT5NonfilePrivateStageError);
});
