import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createT5ProductionBindingRequest, parseT5ProductionBindingRequestArgs, prepareT5ProductionBindingRequest } from "../prepare-yuzhou-production-import-t5-binding-request.mjs";
import { createT5NonfilePrivateStage } from "../hr-cutover/production-import-t5-nonfile-private-stage.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const actorId = "11111111-1111-4111-8111-111111111111";
const privateWrite = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const mode = path => (statSync(path).mode & 0o777).toString(8);
const triple = () => ({ codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") });
const receipt = currentTriple => ({
  formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_stage_receipt", phase: "T5", triple: currentTriple,
  sourceSnapshotSha256: currentTriple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("restore"), sourceBusinessSha256: hash("business"), privateStageSha256: hash("private"), recordCount: 3,
  mappingContractSha256: currentTriple.mappingContractHash, t0DecisionArtifactSha256: hash("t0-decisions"),
  t0TargetIdentitySha256: hash("target"), t0TargetScopeSha256: hash("scope"),
  targetTableCounts: {
    hr_employee_profile: { insert: 1, quarantine: 0 }, hr_employee_family: { insert: 0, quarantine: 0 },
    hr_employee_skill: { insert: 1, quarantine: 0 }, hr_employee_credential: { insert: 0, quarantine: 1 },
    hr_custom_field_definition: { insert: 0, quarantine: 0 }, hr_custom_field_legacy_logic_fingerprint: { insert: 0, quarantine: 0 }, hr_employee_custom_value: { insert: 0, quarantine: 0 },
  }, productionImport: "HOLD",
});

test("T5 binding request carries only verified hashes, count, and audit actor into a still-held signing input", () => {
  const currentTriple = triple();
  const request = createT5ProductionBindingRequest({ triple: currentTriple, receipt: receipt(currentTriple), actorId });
  assert.equal(request.productionImport, "HOLD");
  assert.equal(request.t5Nonfile.actorId, actorId);
  assert.equal(request.authorizationBinding.t5NonfilePrivateStageSha256, hash("private"));
  assert.deepEqual(request.requiredPlanFields, ["t5Nonfile", "authorization.binding.t5NonfilePrivateStageSha256", "rollback.order[0]=T5"]);
  assert.equal(JSON.stringify(request).includes("targetTableCounts"), false);
  assert.throws(() => createT5ProductionBindingRequest({ triple: currentTriple, receipt: { ...receipt(currentTriple), recordCount: 4 }, actorId }), error => error.code === "T5_BINDING_REQUEST_RECEIPT_INVALID");
});

test("binding request accepts the aggregate receipt emitted by the current seven-target private stage", () => {
  const currentTriple = triple();
  const definitionEvidence = Array.from({ length: 19 }, (_, index) => {
    const code = index < 9 ? `def${index + 1}` : index < 14 ? `def${index + 2}` : `def${index + 7}`;
    const valueType = index < 9 ? "text" : index < 14 ? "numeric" : "date";
    return { code, valueType, baseClassification: valueType, legacyDefinitionId: String(index + 1), legacyDatatype: valueType, legacyGroupId: null, legacySortOrder: index, legacyNullable: null, legacyRuleClassification: "inert", sourceIdentitySha256: hash(`definition:${index}`), sourceRowSha256: hash(`definition-row:${index}`), legacyLogicCoverage: { denominator: 10, presentCount: 0, nullCount: 10, reviewStatus: "no_legacy_logic_value", columns: [["description_d","presentation_expression"],["sqltext","legacy_sql_expression"],["flag","legacy_behavior_flag"],["crosssql","legacy_cross_lookup_sql"],["crosscolselectsql","legacy_cross_column_sql"],["crossrowselectsql","legacy_cross_row_sql"],["crosswhere","legacy_cross_filter"],["querywhere","legacy_query_filter"],["ascount","legacy_aggregate_flag"],["ascount2","legacy_secondary_aggregate_flag"]].map(([column,classification]) => ({ column, classification, execution: "forbidden", isSourceNull: true, sourceValueSha256: null })) } };
  });
  const generated = createT5NonfilePrivateStage({
    triple: currentTriple,
    stageManifest: {
      artifactKind: "yuzhou_t5_nonfile_materialization_stage",
      sourceSnapshotSha256: currentTriple.sourceSnapshotHash,
      sourceRestoreReceiptSha256: hash("restore"),
      nonfileBusinessSha256: hash("business"),
      mappingContractSha256: currentTriple.mappingContractHash,
      definitionEvidenceSha256: hash("definitions"),
      definitionEvidenceRows: 19,
      definitionLogicColumnDenominator: 190,
      definitionLogicColumnPresentCount: 0,
      t0DecisionArtifactSha256: hash("t0-decisions"),
      t0TargetIdentitySha256: hash("target"),
      t0TargetScopeSha256: hash("scope"),
      domains: { family: {}, knowhow: {}, person_core: {}, ticket: {} },
      filesExcluded: ["photo", "docs"],
      productionImport: "HOLD",
    },
    definitionEvidence,
    employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: hash("t0-employee") }],
    records: [{
      domain: "skill",
      employeeCode: "E-001",
      sourceTable: "dbo.knowhow",
      sourceKey: "one",
      sourceIdentitySha256: hash("skill-source"),
      sourceRowSha256: hash("skill-row"),
      source: { fixture: true },
      materialized: { disposition: "loaded", gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: "fixture" },
    }],
  });
  const request = createT5ProductionBindingRequest({ triple: currentTriple, receipt: generated.receipt, actorId });
  assert.equal(request.t5Nonfile.privateStageSha256, generated.receipt.privateStageSha256);
  assert.equal(request.t5Nonfile.recordCount, generated.receipt.recordCount);
});

test("binding request CLI accepts only 0600 receipt/triple and writes a new 0600 held request", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-t5-binding-request-"));
  try {
    const outputDir = join(root, "out"); mkdirSync(outputDir, { mode: 0o700 }); chmodSync(outputDir, 0o700);
    const currentTriple = triple();
    const receiptPath = join(root, "receipt.json"); const triplePath = join(root, "triple.json");
    privateWrite(receiptPath, receipt(currentTriple)); privateWrite(triplePath, currentTriple);
    const input = parseT5ProductionBindingRequestArgs(["--receipt", receiptPath, "--triple", triplePath, "--actor-id", actorId, "--output-dir", outputDir, "--request-id", "binding01"]);
    const result = prepareT5ProductionBindingRequest(input);
    assert.equal(result.productionImport, "HOLD"); assert.equal(result.recordCount, 3); assert.equal(mode(result.output), "600");
    const written = JSON.parse(readFileSync(result.output, "utf8"));
    assert.equal(written.t5Nonfile.privateStageSha256, hash("private")); assert.equal(JSON.stringify(written).includes("targetTableCounts"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
