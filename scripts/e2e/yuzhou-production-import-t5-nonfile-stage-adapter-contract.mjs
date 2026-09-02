import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { adaptT5NonfilePrivateStage, adaptT5NonfileSkillStage, ProductionImportT5NonfileStageAdapterError, projectT5NonfileStagedRecord } from "../hr-cutover/production-import-t5-nonfile-stage-adapter.mjs";

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

test("adapts profile, family, skill, and credential without retaining the raw source object", () => {
  const identity = suffix => h(`identity:${suffix}`);
  const row = (kind, suffix, materialized, sourceTable, domain) => ({ domain, employeeCode: "E-001", materialized, source: { ignored: "legacy-source" }, sourceTable, sourceKey: suffix, sourceIdentitySha256: identity(suffix), sourceRowSha256: h(`row:${suffix}`) });
  const profile = row("profile", "profile", { kind: "profile", disposition: "loaded", gaps: [], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null }, "dbo.person.core_residue", "employee_profile_raw");
  const family = row("family", "family", { kind: "family", disposition: "loaded", gaps: [], relationship: "relation", fullName: { encrypted: null, masked: null, fingerprint: null }, contact: { encrypted: null, masked: null, fingerprint: null }, birthDate: null, workUnit: null, jobTitle: null, politicalStatus: null }, "dbo.family", "family");
  const credential = row("credential", "credential", { kind: "credential", disposition: "loaded", gaps: [], credentialType: "type", credentialName: "name", number: { encrypted: null, masked: null, fingerprint: null }, issuingAuthority: null, acquiredDate: null, validTo: null, note: null, legacyFileReferenceSha256: null }, "dbo.ticket", "credential");
  const skillRaw = { ...skill("skill"), source: { ignored: "legacy-source" } };
  const output = adaptT5NonfilePrivateStage({ triple, stageManifest, employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("employee") }], records: [profile, family, skillRaw, credential].map(projectT5NonfileStagedRecord) });
  assert.deepEqual(output.records.map(value => value.targetTable), ["hr_employee_profile", "hr_employee_family", "hr_employee_skill", "hr_employee_credential"]);
  assert.ok(output.records.every(value => value.disposition === "insert" && value.dependencyRefs.length === 1));
  assert.ok(output.records.every(value => !Object.hasOwn(value, "source")));
});
