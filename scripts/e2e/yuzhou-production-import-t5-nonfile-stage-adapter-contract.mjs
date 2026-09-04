import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { adaptT5NonfilePrivateStage, adaptT5NonfileSkillStage, ProductionImportT5NonfileStageAdapterError, projectT5NonfileStagedRecord } from "../hr-cutover/production-import-t5-nonfile-stage-adapter.mjs";

const h = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") };
const stageManifest = { sourceSnapshotHash: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: h("restore"), nonfileBusinessSha256: h("business"), mappingContractSha256: triple.mappingContractHash, definitionEvidenceSha256: h("definitions"), definitionEvidenceRows: 19, definitionLogicColumnDenominator: 190, definitionLogicColumnPresentCount: 0, t0DecisionArtifactSha256: h("t0-decisions"), t0TargetIdentitySha256: h("target"), t0TargetScopeSha256: h("scope"), productionImport: "HOLD" };
const skill = (suffix, employeeCode = "E-001", disposition = "loaded") => ({
  domain: "skill", employeeCode, sourceTable: "dbo.knowhow", sourceKey: suffix, sourceIdentitySha256: h(`identity:${suffix}`), sourceRowSha256: h(`row:${suffix}`),
  materialized: { disposition, gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: `skill-${suffix}` },
});
const customFields = () => [
  ...Array.from({ length: 9 }, (_, index) => ({ code: `def${index + 1}`, label: `field-${index + 1}`, valueType: "text", group: "profile", sortOrder: index, legacyDefinitionId: `${index + 1}`, legacyDatatype: "text", definitionSourceIdentitySha256: h(`definition:${index + 1}`), definitionSourceRowSha256: h(`definition-row:${index + 1}`), value: index === 0 ? "synthetic" : null, rawValue: null, isSourceNull: index !== 0, valid: true })),
  ...Array.from({ length: 5 }, (_, index) => ({ code: `def${index + 11}`, label: `field-${index + 11}`, valueType: "numeric", group: "profile", sortOrder: index + 9, legacyDefinitionId: `${index + 11}`, legacyDatatype: "numeric", definitionSourceIdentitySha256: h(`definition:${index + 11}`), definitionSourceRowSha256: h(`definition-row:${index + 11}`), value: index === 0 ? "12.34" : null, rawValue: null, isSourceNull: index !== 0, valid: true })),
  ...Array.from({ length: 5 }, (_, index) => ({ code: `def${index + 21}`, label: `field-${index + 21}`, valueType: "date", group: "profile", sortOrder: index + 14, legacyDefinitionId: `${index + 21}`, legacyDatatype: "date", definitionSourceIdentitySha256: h(`definition:${index + 21}`), definitionSourceRowSha256: h(`definition-row:${index + 21}`), value: index === 0 ? "2026-09-04" : null, rawValue: null, isSourceNull: index !== 0, valid: true })),
];
const definitionEvidence = () => customFields().map(field => ({
  code: field.code, valueType: field.valueType, baseClassification: field.valueType,
  legacyDefinitionId: field.legacyDefinitionId, legacyDatatype: field.legacyDatatype,
  legacyGroupId: null, legacySortOrder: field.sortOrder, legacyNullable: null,
  legacyRuleClassification: "inert", sourceIdentitySha256: field.definitionSourceIdentitySha256,
  sourceRowSha256: field.definitionSourceRowSha256,
  legacyLogicCoverage: {
    denominator: 10, presentCount: 0, nullCount: 10, reviewStatus: "no_legacy_logic_value",
    columns: [
      ["description_d", "presentation_expression"], ["sqltext", "legacy_sql_expression"], ["flag", "legacy_behavior_flag"],
      ["crosssql", "legacy_cross_lookup_sql"], ["crosscolselectsql", "legacy_cross_column_sql"], ["crossrowselectsql", "legacy_cross_row_sql"],
      ["crosswhere", "legacy_cross_filter"], ["querywhere", "legacy_query_filter"], ["ascount", "legacy_aggregate_flag"],
      ["ascount2", "legacy_secondary_aggregate_flag"],
    ].map(([column, classification]) => ({ column, classification, execution: "forbidden", isSourceNull: true, sourceValueSha256: null })),
  },
}));

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
  const profile = row("profile", "profile", { kind: "profile", disposition: "loaded", gaps: [], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null, legacyProfessionalTitleCode: "T1", technicalTitle: "Reviewed title", customFields: customFields() }, "dbo.person.core_residue", "employee_profile_raw");
  const family = row("family", "family", { kind: "family", disposition: "loaded", gaps: [], relationship: "relation", fullName: { encrypted: null, masked: null, fingerprint: null }, contact: { encrypted: null, masked: null, fingerprint: null }, birthDate: null, workUnit: null, jobTitle: null, politicalStatus: null }, "dbo.family", "family");
  const credential = row("credential", "credential", { kind: "credential", disposition: "loaded", gaps: [], credentialType: "type", credentialName: "name", number: { encrypted: null, masked: null, fingerprint: null }, issuingAuthority: null, acquiredDate: null, validTo: null, note: null, legacyFileReferenceSha256: null }, "dbo.ticket", "credential");
  const skillRaw = { ...skill("skill"), source: { ignored: "legacy-source" } };
  const output = adaptT5NonfilePrivateStage({ triple, stageManifest, definitionEvidence: definitionEvidence(), employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("employee") }], records: [profile, family, skillRaw, credential].map(projectT5NonfileStagedRecord) });
  assert.equal(output.records.length, 232);
  assert.equal(output.records.filter(value => value.targetTable === "hr_custom_field_definition").length, 19);
  assert.equal(output.records.filter(value => value.targetTable === "hr_employee_custom_value").length, 19);
  assert.equal(output.records.filter(value => value.targetTable === "hr_custom_field_legacy_logic_fingerprint").length, 190);
  assert.deepEqual(output.records.filter(value => value.targetTable === "hr_employee_custom_value")[0].dependencyRefs.map(value => value.role).sort(), ["custom_field_definition", "employee"]);
  assert.deepEqual(output.records.filter(value => !["hr_custom_field_definition", "hr_custom_field_legacy_logic_fingerprint", "hr_employee_custom_value"].includes(value.targetTable)).map(value => value.targetTable), ["hr_employee_profile", "hr_employee_family", "hr_employee_skill", "hr_employee_credential"]);
  const profilePayload = output.records.find(value => value.targetTable === "hr_employee_profile").payload;
  assert.equal(profilePayload.legacy_professional_title_code, "T1");
  assert.equal(profilePayload.technical_title, "Reviewed title");
  assert.equal(Object.hasOwn(profilePayload, "position_id"), false);
  assert.ok(output.records.every(value => value.disposition === "insert"));
  assert.ok(output.records.every(value => !Object.hasOwn(value, "source")));
});

test("fails closed when a profile title code and dictionary label are not paired", () => {
  const profile = { domain: "employee_profile_raw", employeeCode: "E-001", sourceTable: "dbo.person.core_residue", sourceKey: "title-drift", sourceIdentitySha256: h("identity:title-drift"), sourceRowSha256: h("row:title-drift"), materialized: { kind: "profile", disposition: "loaded", gaps: [], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null, legacyProfessionalTitleCode: "T1", technicalTitle: null, customFields: customFields() } };
  assert.throws(() => adaptT5NonfilePrivateStage({ triple, stageManifest, definitionEvidence: definitionEvidence(), employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("employee") }], records: [profile] }), ProductionImportT5NonfileStageAdapterError);
});

test("custom field definitions are deduplicated and definition drift is rejected", () => {
  const fields = customFields();
  const makeProfile = (suffix, values = structuredClone(fields)) => ({ domain: "employee_profile_raw", employeeCode: "E-001", sourceTable: "dbo.person.core_residue", sourceKey: suffix, sourceIdentitySha256: h(`identity:${suffix}`), sourceRowSha256: h(`row:${suffix}`), materialized: { kind: "profile", disposition: "loaded", gaps: [], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null, legacyProfessionalTitleCode: null, technicalTitle: null, customFields: values } });
  const input = { triple, stageManifest, definitionEvidence: definitionEvidence(), employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("employee") }], records: [makeProfile("one"), makeProfile("two")] };
  assert.equal(adaptT5NonfilePrivateStage(input).records.filter(value => value.targetTable === "hr_custom_field_definition").length, 19);
  const drift = structuredClone(input);
  drift.records[1].materialized.customFields[0].label = "drift";
  assert.throws(() => adaptT5NonfilePrivateStage(drift), ProductionImportT5NonfileStageAdapterError);
});

test("invalid typed custom values are quarantined without copying their raw value into the production payload", () => {
  const fields = customFields();
  fields[9] = { ...fields[9], isSourceNull: false, valid: false, value: null, rawValue: "private-invalid-fixture" };
  const profile = { domain: "employee_profile_raw", employeeCode: "E-001", sourceTable: "dbo.person.core_residue", sourceKey: "invalid", sourceIdentitySha256: h("identity:invalid"), sourceRowSha256: h("row:invalid"), materialized: { kind: "profile", disposition: "loaded", gaps: [{ fieldLocator: "person.def11", reasonCode: "INVALID_STRUCTURED_VALUE" }], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null, legacyProfessionalTitleCode: null, technicalTitle: null, customFields: fields } };
  const output = adaptT5NonfilePrivateStage({ triple, stageManifest, definitionEvidence: definitionEvidence(), employeeIndex: [{ employeeCode: "E-001", sourceIdentitySha256: h("employee") }], records: [profile] });
  const quarantined = output.records.find(record => record.targetTable === "hr_employee_custom_value" && record.disposition === "quarantine");
  assert.equal(quarantined?.quarantineReason, "INVALID_STRUCTURED_VALUE");
  assert.equal(Object.hasOwn(quarantined ?? {}, "payload"), false);
  assert.equal(JSON.stringify(output).includes("private-invalid-fixture"), false);
});
