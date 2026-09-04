import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { parseT5ProductionPrivateStageArgs, prepareT5ProductionPrivateStage } from "../prepare-yuzhou-production-import-t5-private-stage.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const privateWrite = (path, value) => { writeFileSync(path, `${typeof value === "string" ? value : JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); return hash(readFileSync(path)); };
const mode = path => (statSync(path).mode & 0o777).toString(8);
const customFields = () => [
  ...Array.from({ length: 9 }, (_, index) => ({ code: `def${index + 1}`, label: `field-${index + 1}`, valueType: "text", group: "profile", sortOrder: index, legacyDefinitionId: `${index + 1}`, legacyDatatype: "text", definitionSourceIdentitySha256: hash(`definition:${index + 1}`), definitionSourceRowSha256: hash(`definition-row:${index + 1}`), value: null, rawValue: null, isSourceNull: true, valid: true })),
  ...Array.from({ length: 5 }, (_, index) => ({ code: `def${index + 11}`, label: `field-${index + 11}`, valueType: "numeric", group: "profile", sortOrder: index + 9, legacyDefinitionId: `${index + 11}`, legacyDatatype: "numeric", definitionSourceIdentitySha256: hash(`definition:${index + 11}`), definitionSourceRowSha256: hash(`definition-row:${index + 11}`), value: null, rawValue: null, isSourceNull: true, valid: true })),
  ...Array.from({ length: 5 }, (_, index) => ({ code: `def${index + 21}`, label: `field-${index + 21}`, valueType: "date", group: "profile", sortOrder: index + 14, legacyDefinitionId: `${index + 21}`, legacyDatatype: "date", definitionSourceIdentitySha256: hash(`definition:${index + 21}`), definitionSourceRowSha256: hash(`definition-row:${index + 21}`), value: null, rawValue: null, isSourceNull: true, valid: true })),
];
const definitionEvidence = () => customFields().map(field => ({ code: field.code, valueType: field.valueType, baseClassification: field.valueType, legacyDefinitionId: field.legacyDefinitionId, legacyDatatype: field.legacyDatatype, legacyGroupId: null, legacySortOrder: field.sortOrder, legacyNullable: null, legacyRuleClassification: "inert", sourceIdentitySha256: field.definitionSourceIdentitySha256, sourceRowSha256: field.definitionSourceRowSha256, legacyLogicCoverage: { denominator: 10, presentCount: 0, nullCount: 10, reviewStatus: "no_legacy_logic_value", columns: [["description_d","presentation_expression"],["sqltext","legacy_sql_expression"],["flag","legacy_behavior_flag"],["crosssql","legacy_cross_lookup_sql"],["crosscolselectsql","legacy_cross_column_sql"],["crossrowselectsql","legacy_cross_row_sql"],["crosswhere","legacy_cross_filter"],["querywhere","legacy_query_filter"],["ascount","legacy_aggregate_flag"],["ascount2","legacy_secondary_aggregate_flag"]].map(([column,classification]) => ({ column, classification, execution: "forbidden", isSourceNull: true, sourceValueSha256: null })) } }));

test("private-stage CLI turns a verified T5 stage into 0600 private files and a safe receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-t5-private-stage-"));
  try {
    const stage = join(root, "stage");
    const outputRoot = join(root, "out");
    const triple = join(root, "triple.json");
    const t0Decisions = join(root, "t0-decisions.json");
    for (const path of [stage, outputRoot]) { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); }
    const source = hash("source");
    const rows = {
      family: "", ticket: "",
      person_core: JSON.stringify({ domain: "employee_profile_raw", employeeCode: "E-001", sourceTable: "dbo.person.core_residue", sourceKey: "profile-one", sourceIdentitySha256: hash("employee"), sourceRowSha256: hash("profile-row"), source: { ignored: true }, materialized: { kind: "profile", disposition: "loaded", gaps: [], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null, legacyProfessionalTitleCode: null, technicalTitle: null, customFields: customFields() } }),
      knowhow: JSON.stringify({ domain: "skill", employeeCode: "E-001", sourceTable: "dbo.knowhow", sourceKey: "one", sourceIdentitySha256: hash("skill-source"), sourceRowSha256: hash("skill-row"), source: { ignored: true }, materialized: { disposition: "loaded", gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: "synthetic" } }),
    };
    const domains = {};
    for (const [name, line] of Object.entries(rows)) {
      const file = `${name}.jsonl`;
      domains[name] = { file, fileSha256: privateWrite(join(stage, file), line), rows: line ? 1 : 0 };
    }
    const tripleValue = { codeSha: "1".repeat(40), sourceSnapshotHash: source, mappingContractHash: hash("mapping") };
    const definitionRows = definitionEvidence();
    const definitionFileSha256 = privateWrite(join(stage, "defs.safe-evidence.jsonl"), definitionRows.map(row => JSON.stringify(row)).join("\n"));
    privateWrite(join(stage, "manifest.json"), { artifactKind: "yuzhou_t5_nonfile_materialization_stage", sourceSnapshotSha256: source, sourceRestoreReceiptSha256: hash("restore"), mappingContractSha256: tripleValue.mappingContractHash, nonfileBusinessSha256: hash("business"), definitionEvidence: { rows: 19, file: "defs.safe-evidence.jsonl", fileSha256: definitionFileSha256, logicColumnDenominator: 190, logicColumnPresentCount: 0 }, domains, filesExcluded: ["photo", "docs"], sourceRows: 2, productionImport: "HOLD" });
    privateWrite(triple, tripleValue);
    const t0EmployeeIdentity = hash("dbo.person\0E-001");
    privateWrite(t0Decisions, {
      formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple: tripleValue,
      phaseArtifactSha256: hash("t0-phase"), targetInventoryArtifactSha256: hash("target-inventory"), targetIdentitySha256: hash("target"),
      targetScope: { tenantId: "tenant", parkId: "park", scopeSha256: hash("scope") }, jobStateDecisionArtifactSha256: hash("job-state"),
      status: "READY_FOR_FREEZE", countByDisposition: { insert: 1, skip_exact: 0, review_target_collision: 0, quarantine: 0 },
      records: [{ phase: "T0", targetTable: "hr_employee", sourceSystem: "yuzhou-v10", sourceTable: "dbo.person", sourcePkCanonical: `sha256:${t0EmployeeIdentity}`, sourceIdentitySha256: t0EmployeeIdentity, sourceRowSha256: hash("t0-employee-row"), candidateDisposition: "insert", reasonCode: null, targetFields: { employee_code: "E-001" }, dependencyRefs: [], businessIdentitySha256: hash("employee-business"), expectedTargetId: "11111111-1111-4111-8111-111111111111", expectedTargetVersion: 0, expectedTargetCanonicalSha256: hash("employee-target") }],
      productionImport: "HOLD",
    });
    const result = prepareT5ProductionPrivateStage({ stagePath: stage, triplePath: triple, t0DecisionsPath: t0Decisions, outputRoot, runId: "t5private01" });
    assert.equal(result.recordCount, 230);
    assert.equal(result.productionImport, "HOLD");
    assert.equal(mode(result.output), "700");
    assert.equal(mode(join(result.output, "private-stage.json")), "600");
    assert.equal(mode(join(result.output, "receipt.json")), "600");
    const receipt = JSON.parse(readFileSync(join(result.output, "receipt.json"), "utf8"));
    assert.equal(receipt.recordCount, 230);
    assert.equal(receipt.targetTableCounts.hr_employee_skill.insert, 1);
    assert.equal(receipt.targetTableCounts.hr_custom_field_definition.insert, 19);
    assert.equal(receipt.targetTableCounts.hr_custom_field_legacy_logic_fingerprint.insert, 190);
    assert.equal(receipt.targetTableCounts.hr_employee_custom_value.insert, 19);
    assert.equal(receipt.t0DecisionArtifactSha256, hash(readFileSync(t0Decisions)));
    assert.equal(JSON.stringify(receipt).includes("synthetic"), false);
    const privateStage = JSON.parse(readFileSync(join(result.output, "private-stage.json"), "utf8"));
    const skill = privateStage.records.find(record => record.targetTable === "hr_employee_skill");
    assert.equal(skill.dependencyRefs[0].sourceIdentitySha256, t0EmployeeIdentity);
    assert.equal(parseT5ProductionPrivateStageArgs(["--stage", stage, "--triple", triple, "--t0-decisions", t0Decisions, "--output-root", outputRoot, "--run-id", "t5private01"]).runId, "t5private01");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
