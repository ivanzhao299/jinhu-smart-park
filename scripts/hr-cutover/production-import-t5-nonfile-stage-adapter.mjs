import { createHash } from "node:crypto";

import { DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL } from "./production-import-t5-nonfile-target-model.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const STAGED_SKILL_KEYS = ["domain", "employeeCode", "materialized", "sourceIdentitySha256", "sourceKey", "sourceRowSha256", "sourceTable"];
const MATERIALIZED_SKILL_KEYS = ["disposition", "gaps", "kind", "legacyGrade", "note", "proficiency", "skillName"];
const EMPLOYEE_INDEX_KEYS = ["employeeCode", "sourceIdentitySha256"];
const RAW_STAGED_RECORD_KEYS = ["domain", "employeeCode", "materialized", "source", "sourceIdentitySha256", "sourceKey", "sourceRowSha256", "sourceTable"];
const MATERIALIZED_PROFILE_KEYS = ["address", "customFields", "dateOfBirth", "degree", "disposition", "ethnicity", "foreignLanguage", "gaps", "gender", "graduationDate", "graduationSchool", "healthStatus", "highestEducation", "homePhone", "idNumber", "idType", "jobGrade", "jobTitle", "kind", "legacyProfessionalTitleCode", "major", "maritalStatus", "nativePlace", "personalEmail", "personalMobile", "politicalStatus", "technicalTitle"];
const CUSTOM_FIELD_KEYS = ["code", "definitionSourceIdentitySha256", "definitionSourceRowSha256", "group", "isSourceNull", "label", "legacyDatatype", "legacyDefinitionId", "rawValue", "sortOrder", "valid", "value", "valueType"];
const DEFINITION_EVIDENCE_KEYS = ["baseClassification", "code", "legacyDatatype", "legacyDefinitionId", "legacyGroupId", "legacyLogicCoverage", "legacyNullable", "legacyRuleClassification", "legacySortOrder", "sourceIdentitySha256", "sourceRowSha256", "valueType"];
const DEFINITION_LOGIC_COLUMNS = Object.freeze([
  ["description_d", "presentation_expression"], ["sqltext", "legacy_sql_expression"], ["flag", "legacy_behavior_flag"],
  ["crosssql", "legacy_cross_lookup_sql"], ["crosscolselectsql", "legacy_cross_column_sql"], ["crossrowselectsql", "legacy_cross_row_sql"],
  ["crosswhere", "legacy_cross_filter"], ["querywhere", "legacy_query_filter"], ["ascount", "legacy_aggregate_flag"],
  ["ascount2", "legacy_secondary_aggregate_flag"],
]);
const CUSTOM_FIELD_SPECS = Object.freeze([
  ...Array.from({ length: 9 }, (_, index) => Object.freeze({ code: `def${index + 1}`, valueType: "text", sortOrder: index })),
  ...Array.from({ length: 5 }, (_, index) => Object.freeze({ code: `def${index + 11}`, valueType: "numeric", sortOrder: index + 9 })),
  ...Array.from({ length: 5 }, (_, index) => Object.freeze({ code: `def${index + 21}`, valueType: "date", sortOrder: index + 14 })),
]);
const T5_NONFILE_RULES = Object.freeze({
  profile: Object.freeze({ domain: "employee_profile_raw", sourceTable: "dbo.person.core_residue", targetTable: "hr_employee_profile", recordKind: "profile" }),
  family: Object.freeze({ domain: "family", sourceTable: "dbo.family", targetTable: "hr_employee_family", recordKind: "family" }),
  skill: Object.freeze({ domain: "skill", sourceTable: "dbo.knowhow", targetTable: "hr_employee_skill", recordKind: "skill" }),
  credential: Object.freeze({ domain: "credential", sourceTable: "dbo.ticket", targetTable: "hr_employee_credential", recordKind: "credential" }),
});

export class ProductionImportT5NonfileStageAdapterError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportT5NonfileStageAdapterError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportT5NonfileStageAdapterError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const canonicalJson = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys, label) => {
  if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `${label} keys differ`);
};
const assertHash = (value, label) => { if (!SHA256.test(value ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `${label} hash invalid`); };

function validateTriple(value) {
  exactKeys(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "triple");
  if (!CODE_SHA.test(value.codeSha ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "code SHA invalid");
  assertHash(value.sourceSnapshotHash, "source snapshot");
  assertHash(value.mappingContractHash, "mapping contract");
}

function validateStageBinding(value, triple) {
  exactKeys(value, ["sourceSnapshotHash", "sourceRestoreReceiptSha256", "nonfileBusinessSha256", "mappingContractSha256", "definitionEvidenceSha256", "definitionEvidenceRows", "definitionLogicColumnDenominator", "definitionLogicColumnPresentCount", "t0DecisionArtifactSha256", "t0TargetIdentitySha256", "t0TargetScopeSha256", "productionImport"], "stage manifest");
  if (value.sourceSnapshotHash !== triple.sourceSnapshotHash || value.mappingContractSha256 !== triple.mappingContractHash || value.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "stage source binding invalid");
  assertHash(value.sourceRestoreReceiptSha256, "restore receipt");
  assertHash(value.nonfileBusinessSha256, "nonfile business");
  assertHash(value.definitionEvidenceSha256, "definition evidence");
  if (value.definitionEvidenceRows !== CUSTOM_FIELD_SPECS.length || value.definitionLogicColumnDenominator !== CUSTOM_FIELD_SPECS.length * DEFINITION_LOGIC_COLUMNS.length || !Number.isSafeInteger(value.definitionLogicColumnPresentCount) || value.definitionLogicColumnPresentCount < 0 || value.definitionLogicColumnPresentCount > value.definitionLogicColumnDenominator) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "definition evidence counts invalid");
  assertHash(value.t0DecisionArtifactSha256, "T0 decision artifact");
  assertHash(value.t0TargetIdentitySha256, "T0 target identity");
  assertHash(value.t0TargetScopeSha256, "T0 target scope");
}

function validateDefinitionEvidence(value, stageManifest) {
  if (!Array.isArray(value) || value.length !== CUSTOM_FIELD_SPECS.length) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "definition evidence count differs");
  let presentTotal = 0;
  const byCode = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactKeys(row, DEFINITION_EVIDENCE_KEYS, `definition evidence[${index}]`);
    const expected = CUSTOM_FIELD_SPECS[index];
    if (row.code !== expected.code || row.valueType !== expected.valueType || row.baseClassification !== expected.valueType || typeof row.legacyDefinitionId !== "string" || row.legacyDefinitionId.length === 0 || typeof row.legacyDatatype !== "string" || row.legacyDatatype.length === 0 || (row.legacyGroupId !== null && typeof row.legacyGroupId !== "string") || (row.legacySortOrder !== null && !Number.isSafeInteger(row.legacySortOrder)) || row.legacyNullable !== null || !["inert", "review_required"].includes(row.legacyRuleClassification)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `definition evidence[${index}] metadata invalid`);
    assertHash(row.sourceIdentitySha256, `definition evidence[${index}] identity`);
    assertHash(row.sourceRowSha256, `definition evidence[${index}] row`);
    exactKeys(row.legacyLogicCoverage, ["columns", "denominator", "nullCount", "presentCount", "reviewStatus"], `definition evidence[${index}].legacyLogicCoverage`);
    const coverage = row.legacyLogicCoverage;
    if (coverage.denominator !== DEFINITION_LOGIC_COLUMNS.length || !Number.isSafeInteger(coverage.presentCount) || !Number.isSafeInteger(coverage.nullCount) || coverage.presentCount + coverage.nullCount !== coverage.denominator || coverage.reviewStatus !== (coverage.presentCount ? "requires_capability_review" : "no_legacy_logic_value") || !Array.isArray(coverage.columns) || coverage.columns.length !== coverage.denominator) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `definition evidence[${index}] coverage invalid`);
    for (let columnIndex = 0; columnIndex < DEFINITION_LOGIC_COLUMNS.length; columnIndex += 1) {
      const column = coverage.columns[columnIndex];
      exactKeys(column, ["classification", "column", "execution", "isSourceNull", "sourceValueSha256"], `definition evidence[${index}].columns[${columnIndex}]`);
      const [name, classification] = DEFINITION_LOGIC_COLUMNS[columnIndex];
      if (column.column !== name || column.classification !== classification || column.execution !== "forbidden" || typeof column.isSourceNull !== "boolean" || (column.isSourceNull ? column.sourceValueSha256 !== null : !SHA256.test(column.sourceValueSha256 ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `definition evidence[${index}].columns[${columnIndex}] invalid`);
    }
    if (coverage.columns.filter(column => !column.isSourceNull).length !== coverage.presentCount) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `definition evidence[${index}] present count differs`);
    presentTotal += coverage.presentCount;
    byCode.set(row.code, structuredClone(row));
  }
  if (presentTotal !== stageManifest.definitionLogicColumnPresentCount) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "definition evidence total differs");
  return byCode;
}

function validateEmployeeIndex(value) {
  if (!Array.isArray(value)) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_INDEX_INVALID", "employee index must be an array");
  const index = new Map();
  for (const row of value) {
    exactKeys(row, EMPLOYEE_INDEX_KEYS, "employee index row");
    if (typeof row.employeeCode !== "string" || row.employeeCode.length === 0) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_INDEX_INVALID", "employee code invalid");
    assertHash(row.sourceIdentitySha256, "employee source identity");
    if (index.has(row.employeeCode)) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_INDEX_INVALID", "employee index duplicate");
    index.set(row.employeeCode, row.sourceIdentitySha256);
  }
  return index;
}

function validateSkill(row) {
  exactKeys(row, STAGED_SKILL_KEYS, "staged skill");
  if (row.domain !== "skill" || row.sourceTable !== "dbo.knowhow" || typeof row.employeeCode !== "string" || row.employeeCode.length === 0 || typeof row.sourceKey !== "string" || row.sourceKey.length === 0) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "skill source identity invalid");
  assertHash(row.sourceIdentitySha256, "skill source identity");
  assertHash(row.sourceRowSha256, "skill source row");
  exactKeys(row.materialized, MATERIALIZED_SKILL_KEYS, "materialized skill");
  if (row.materialized.kind !== "skill" || !["loaded", "quarantined"].includes(row.materialized.disposition) || !Array.isArray(row.materialized.gaps) || typeof row.materialized.skillName !== "string" || row.materialized.skillName.length === 0 || (row.materialized.proficiency !== null && typeof row.materialized.proficiency !== "string") || (row.materialized.legacyGrade !== null && typeof row.materialized.legacyGrade !== "string") || (row.materialized.note !== null && typeof row.materialized.note !== "string")) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "materialized skill invalid");
}

function nullableString(value, label) {
  if (value !== null && typeof value !== "string") fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `${label} invalid`);
  return value;
}

function privateValue(value, label) {
  if (!object(value)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `${label} invalid`);
  for (const field of ["encrypted", "masked", "fingerprint"]) nullableString(value[field], `${label}.${field}`);
  return value;
}

export function assertT5NonfilePhysicalMeasurementGapBoundary(value) {
  if (!object(value) || Object.hasOwn(value, "heightCm") || Object.hasOwn(value, "weightKg")) {
    fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "unreviewed physical measurement fields are forbidden");
  }
  return value;
}

function customFieldValueSourceIdentity(profileSourceIdentitySha256, code) {
  return hash(`yuzhou-hr-production-t5-custom-value-source-v1\0${profileSourceIdentitySha256}\0${code}`);
}

function validateCustomFields(value) {
  if (!Array.isArray(value) || value.length !== CUSTOM_FIELD_SPECS.length) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "profile customFields count differs");
  return value.map((field, index) => {
    exactKeys(field, CUSTOM_FIELD_KEYS, `profile customFields[${index}]`);
    const expected = CUSTOM_FIELD_SPECS[index];
    if (field.code !== expected.code || field.valueType !== expected.valueType || field.sortOrder !== expected.sortOrder) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] identity differs`);
    if (typeof field.label !== "string" || field.label.trim().length === 0 || (field.group !== null && typeof field.group !== "string") || (field.legacyDefinitionId !== null && typeof field.legacyDefinitionId !== "string") || (field.legacyDatatype !== null && typeof field.legacyDatatype !== "string")) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] definition invalid`);
    assertHash(field.definitionSourceIdentitySha256, `profile customFields[${index}] definition identity`);
    assertHash(field.definitionSourceRowSha256, `profile customFields[${index}] definition row`);
    if (typeof field.isSourceNull !== "boolean" || typeof field.valid !== "boolean" || (field.value !== null && typeof field.value !== "string") || (field.rawValue !== null && typeof field.rawValue !== "string")) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] value invalid`);
    if (field.isSourceNull) {
      if (!field.valid || field.value !== null || field.rawValue !== null) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] null semantics differ`);
    } else if (field.valid) {
      if (field.value === null || field.rawValue !== null) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] valid semantics differ`);
      if (field.valueType === "numeric" && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(field.value)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] numeric value invalid`);
      if (field.valueType === "date" && !/^\d{4}-\d{2}-\d{2}$/u.test(field.value)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] date value invalid`);
    } else if (field.value !== null || typeof field.rawValue !== "string" || field.rawValue.length === 0) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `profile customFields[${index}] invalid-value evidence differs`);
    return structuredClone(field);
  });
}

function definitionRecord(field, evidence) {
  const logic = new Map(evidence.legacyLogicCoverage.columns.map(column => [column.column, column]));
  const payload = {
    field_code: field.code,
    display_label: field.label,
    value_type: field.valueType,
    field_group: field.group,
    sort_order: field.sortOrder,
    sensitivity: "restricted",
    origin: "legacy",
    source_system: "yuzhou-v10",
    source_table: "dbo.defs",
    source_column: field.code,
    source_identity_sha256: field.definitionSourceIdentitySha256,
    source_row_sha256: field.definitionSourceRowSha256,
    status: "enabled",
    legacy_definition_id: evidence.legacyDefinitionId,
    legacy_datatype: evidence.legacyDatatype,
    legacy_group_id: evidence.legacyGroupId,
    legacy_sort_order: evidence.legacySortOrder,
    legacy_nullable: evidence.legacyNullable,
    legacy_description_d_present: !logic.get("description_d").isSourceNull,
    legacy_description_d_sha256: logic.get("description_d").sourceValueSha256,
    legacy_sqltext_present: !logic.get("sqltext").isSourceNull,
    legacy_sqltext_sha256: logic.get("sqltext").sourceValueSha256,
    legacy_crosssql_present: !logic.get("crosssql").isSourceNull,
    legacy_crosssql_sha256: logic.get("crosssql").sourceValueSha256,
    base_classification: evidence.baseClassification,
    legacy_rule_classification: evidence.legacyRuleClassification,
  };
  return {
    sourceSystem: "yuzhou-v10",
    sourceTable: "dbo.defs",
    sourcePkCanonical: `sha256:${field.definitionSourceIdentitySha256}`,
    sourceIdentitySha256: field.definitionSourceIdentitySha256,
    sourceRowSha256: field.definitionSourceRowSha256,
    targetTable: "hr_custom_field_definition",
    dependencyMode: "none",
    dependencyRefs: [],
    disposition: "insert",
    payload,
  };
}

function definitionLogicRecords(field, evidence) {
  return evidence.legacyLogicCoverage.columns.map(column => {
    const sourceIdentitySha256 = hash(`yuzhou-hr-production-t5-custom-definition-logic-v1\0${field.definitionSourceIdentitySha256}\0${column.column}`);
    const payload = {
      legacy_column: column.column,
      classification: column.classification,
      execution: "forbidden",
      source_present: !column.isSourceNull,
      is_source_null: column.isSourceNull,
      source_value_sha256: column.sourceValueSha256,
    };
    return {
      sourceSystem: "yuzhou-v10",
      sourceTable: "dbo.defs",
      sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
      sourceIdentitySha256,
      sourceRowSha256: hash(canonicalJson({ definitionSourceRowSha256: field.definitionSourceRowSha256, ...payload })),
      targetTable: "hr_custom_field_legacy_logic_fingerprint",
      dependencyMode: "custom_field_definition",
      dependencyRefs: [{ role: "custom_field_definition", phase: "T5", expectedTargetTable: "hr_custom_field_definition", sourceIdentitySha256: field.definitionSourceIdentitySha256 }],
      disposition: "insert",
      payload,
    };
  });
}

function customValueRecord(row, field, employeeSourceIdentitySha256) {
  const sourceIdentitySha256 = customFieldValueSourceIdentity(row.sourceIdentitySha256, field.code);
  const sourceRowSha256 = hash(canonicalJson({ profileSourceRowSha256: row.sourceRowSha256, code: field.code, value: field.value, rawValue: field.rawValue, isSourceNull: field.isSourceNull, valid: field.valid }));
  const valueStatus = field.isSourceNull ? "null" : field.valid ? "valid" : "invalid";
  const payload = {
    text_value: valueStatus === "valid" && field.valueType === "text" ? field.value : null,
    numeric_value: valueStatus === "valid" && field.valueType === "numeric" ? field.value : null,
    date_value: valueStatus === "valid" && field.valueType === "date" ? field.value : null,
    boolean_value: null,
    is_source_null: field.isSourceNull,
    value_status: valueStatus,
    origin: "legacy",
    source_system: "yuzhou-v10",
    source_table: "dbo.person",
    source_column: field.code,
    source_identity_sha256: sourceIdentitySha256,
    source_row_sha256: sourceRowSha256,
  };
  const dependencies = [
    { role: "custom_field_definition", phase: "T5", expectedTargetTable: "hr_custom_field_definition", sourceIdentitySha256: field.definitionSourceIdentitySha256 },
    ...(employeeSourceIdentitySha256 ? [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employeeSourceIdentitySha256 }] : []),
  ];
  const canLoad = row.materialized.disposition === "loaded" && employeeSourceIdentitySha256 && field.valid;
  return {
    sourceSystem: "yuzhou-v10",
    sourceTable: "dbo.person",
    sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
    sourceIdentitySha256,
    sourceRowSha256,
    targetTable: "hr_employee_custom_value",
    dependencyMode: "employee_custom_field",
    dependencyRefs: dependencies,
    disposition: canLoad ? "insert" : "quarantine",
    ...(canLoad ? { payload } : { quarantineReason: !field.valid ? "INVALID_STRUCTURED_VALUE" : row.materialized.disposition === "quarantined" ? "SOURCE_MATERIALIZATION_QUARANTINED" : "EMPLOYEE_NOT_MAPPED" }),
  };
}

/**
 * Drops the legacy raw-source object before a T5 row enters the production
 * artifact path. The retained materialized representation is already the
 * reviewed, privacy-preserving projection produced by the source stage.
 */
export function projectT5NonfileStagedRecord(raw) {
  exactKeys(raw, RAW_STAGED_RECORD_KEYS, "raw staged T5 record");
  if (!object(raw.source)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "raw source object missing");
  return {
    domain: raw.domain,
    employeeCode: raw.employeeCode,
    materialized: structuredClone(raw.materialized),
    sourceIdentitySha256: raw.sourceIdentitySha256,
    sourceKey: raw.sourceKey,
    sourceRowSha256: raw.sourceRowSha256,
    sourceTable: raw.sourceTable,
  };
}

function validateNonfileRecord(row) {
  exactKeys(row, STAGED_SKILL_KEYS, "staged T5 nonfile record");
  const rule = T5_NONFILE_RULES[row.materialized?.kind];
  if (!rule || row.domain !== rule.domain || row.sourceTable !== rule.sourceTable || typeof row.employeeCode !== "string" || row.employeeCode.length === 0 || typeof row.sourceKey !== "string" || row.sourceKey.length === 0) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "T5 source identity invalid");
  assertHash(row.sourceIdentitySha256, "T5 source identity");
  assertHash(row.sourceRowSha256, "T5 source row");
  if (!object(row.materialized) || !["loaded", "quarantined"].includes(row.materialized.disposition) || !Array.isArray(row.materialized.gaps)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "T5 materialization invalid");
  return rule;
}

function payloadForT5Record(row, rule) {
  const value = row.materialized;
  const base = { legacy_source_identity_sha256: row.sourceIdentitySha256, legacy_source_row_sha256: row.sourceRowSha256 };
  if (rule.recordKind === "skill") {
    if (typeof value.skillName !== "string" || value.skillName.length === 0) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "skill name invalid");
    return { skill_name: value.skillName, proficiency: nullableString(value.proficiency, "skill.proficiency"), legacy_grade: nullableString(value.legacyGrade, "skill.legacyGrade"), note: nullableString(value.note, "skill.note"), ...base };
  }
  if (rule.recordKind === "profile") {
    assertT5NonfilePhysicalMeasurementGapBoundary(value);
    exactKeys(value, MATERIALIZED_PROFILE_KEYS, "materialized profile");
    privateValue(value.idNumber, "profile.idNumber");
    validateCustomFields(value.customFields);
    for (const field of ["idType", "gender", "dateOfBirth", "ethnicity", "nativePlace", "politicalStatus", "maritalStatus", "healthStatus", "address", "homePhone", "personalMobile", "personalEmail", "highestEducation", "major", "degree", "graduationSchool", "graduationDate", "foreignLanguage", "jobTitle", "jobGrade", "legacyProfessionalTitleCode", "technicalTitle"]) nullableString(value[field], `profile.${field}`);
    if (value.legacyProfessionalTitleCode !== null && value.legacyProfessionalTitleCode.length > 2) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "profile professional title code invalid");
    if ((value.legacyProfessionalTitleCode === null) !== (value.technicalTitle === null)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "profile professional title dictionary binding differs");
    return { id_type: value.idType, id_number_encrypted: value.idNumber.encrypted, id_number_masked: value.idNumber.masked, id_number_fingerprint: value.idNumber.fingerprint, gender: value.gender, date_of_birth: value.dateOfBirth, ethnicity: value.ethnicity, native_place: value.nativePlace, political_status: value.politicalStatus, marital_status: value.maritalStatus, health_status: value.healthStatus, address: value.address, home_phone: value.homePhone, personal_mobile: value.personalMobile, personal_email: value.personalEmail, highest_education: value.highestEducation, major: value.major, degree: value.degree, graduation_school: value.graduationSchool, graduation_date: value.graduationDate, foreign_language: value.foreignLanguage, job_title: value.jobTitle, job_grade: value.jobGrade, legacy_professional_title_code: value.legacyProfessionalTitleCode, technical_title: value.technicalTitle, ...base };
  }
  if (rule.recordKind === "family") {
    privateValue(value.fullName, "family.fullName"); privateValue(value.contact, "family.contact");
    for (const field of ["relationship", "birthDate", "workUnit", "jobTitle", "politicalStatus"]) nullableString(value[field], `family.${field}`);
    if (value.relationship === null) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "family relationship invalid");
    return { relationship: value.relationship, full_name_encrypted: value.fullName.encrypted, full_name_masked: value.fullName.masked, full_name_fingerprint: value.fullName.fingerprint, contact_encrypted: value.contact.encrypted, contact_masked: value.contact.masked, contact_fingerprint: value.contact.fingerprint, birth_date: value.birthDate, work_unit: value.workUnit, job_title: value.jobTitle, political_status: value.politicalStatus, ...base };
  }
  privateValue(value.number, "credential.number");
  for (const field of ["credentialType", "credentialName", "issuingAuthority", "acquiredDate", "validTo", "note", "legacyFileReferenceSha256"]) nullableString(value[field], `credential.${field}`);
  if (value.credentialType === null || value.credentialName === null) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "credential identity invalid");
  return { credential_type: value.credentialType, credential_name: value.credentialName, number_encrypted: value.number.encrypted, number_masked: value.number.masked, number_fingerprint: value.number.fingerprint, issuing_authority: value.issuingAuthority, acquired_date: value.acquiredDate, valid_to: value.validTo, note: value.note, legacy_file_reference_sha256: value.legacyFileReferenceSha256, ...base };
}

/**
 * Produces the deterministic, non-file T5 skill records used by the unified
 * production payload generator. It does not read files, connect to a database,
 * or emit values: callers keep the resulting payload in their private artifact.
 */
export function adaptT5NonfileSkillStage(input) {
  exactKeys(input, ["triple", "stageManifest", "employeeIndex", "records"], "input");
  validateTriple(input.triple);
  validateStageBinding(input.stageManifest, input.triple);
  const employees = validateEmployeeIndex(input.employeeIndex);
  if (!Array.isArray(input.records)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "skill records must be an array");
  const seen = new Set();
  const records = input.records.map(row => {
    validateSkill(row);
    if (seen.has(row.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "skill source identity duplicate");
    seen.add(row.sourceIdentitySha256);
    const employeeSourceIdentitySha256 = employees.get(row.employeeCode);
    const canLoad = row.materialized.disposition === "loaded" && employeeSourceIdentitySha256;
    const payload = canLoad ? {
      skill_name: row.materialized.skillName,
      proficiency: row.materialized.proficiency,
      legacy_grade: row.materialized.legacyGrade,
      note: row.materialized.note,
      legacy_source_identity_sha256: row.sourceIdentitySha256,
      legacy_source_row_sha256: row.sourceRowSha256,
    } : null;
    return {
      sourceSystem: "yuzhou-v10",
      sourceTable: row.sourceTable,
      sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`,
      sourceIdentitySha256: row.sourceIdentitySha256,
      sourceRowSha256: row.sourceRowSha256,
      targetTable: "hr_employee_skill",
      dependencyMode: "employee",
      dependencyRefs: employeeSourceIdentitySha256 ? [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employeeSourceIdentitySha256 }] : [],
      disposition: canLoad ? "insert" : "quarantine",
      ...(payload ? { payload, payloadSha256: hash(`${JSON.stringify(payload)}\n`) } : { quarantineReason: row.materialized.disposition === "quarantined" ? "SOURCE_MATERIALIZATION_QUARANTINED" : "EMPLOYEE_NOT_MAPPED" }),
    };
  });
  return {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_t5_nonfile_skill_stage",
    phase: DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.phase,
    triple: structuredClone(input.triple),
    sourceSnapshotHash: input.stageManifest.sourceSnapshotHash,
    sourceRestoreReceiptSha256: input.stageManifest.sourceRestoreReceiptSha256,
    sourceBusinessSha256: input.stageManifest.nonfileBusinessSha256,
    mappingContractSha256: input.stageManifest.mappingContractSha256,
    t0DecisionArtifactSha256: input.stageManifest.t0DecisionArtifactSha256,
    t0TargetIdentitySha256: input.stageManifest.t0TargetIdentitySha256,
    t0TargetScopeSha256: input.stageManifest.t0TargetScopeSha256,
    records,
    productionImport: "HOLD",
  };
}

/**
 * Adapts every non-file T5 materialization type. The result is deliberately a
 * private payload-stage object: it is input to the sealed production writer,
 * never a public report or a browser/API response.
 */
export function adaptT5NonfilePrivateStage(input) {
  exactKeys(input, ["triple", "stageManifest", "definitionEvidence", "employeeIndex", "records"], "input");
  validateTriple(input.triple);
  validateStageBinding(input.stageManifest, input.triple);
  const definitionEvidence = validateDefinitionEvidence(input.definitionEvidence, input.stageManifest);
  const employees = validateEmployeeIndex(input.employeeIndex);
  if (!Array.isArray(input.records)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "T5 records must be an array");
  const seen = new Set();
  const records = [];
  const definitions = new Map();
  const definitionLogic = new Map();
  for (const row of input.records) {
    const rule = validateNonfileRecord(row);
    if (seen.has(row.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "T5 source identity duplicate");
    seen.add(row.sourceIdentitySha256);
    const employeeSourceIdentitySha256 = employees.get(row.employeeCode);
    const canLoad = row.materialized.disposition === "loaded" && employeeSourceIdentitySha256;
    if (rule.recordKind === "profile") {
      for (const field of validateCustomFields(row.materialized.customFields)) {
        const evidence = definitionEvidence.get(field.code);
        if (!evidence || evidence.valueType !== field.valueType || evidence.legacyDefinitionId !== field.legacyDefinitionId || evidence.legacyDatatype !== field.legacyDatatype || evidence.sourceIdentitySha256 !== field.definitionSourceIdentitySha256 || evidence.sourceRowSha256 !== field.definitionSourceRowSha256) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `custom field definition evidence drift: ${field.code}`);
        const record = definitionRecord(field, evidence);
        const existing = definitions.get(record.sourceIdentitySha256);
        if (existing && canonicalJson(existing) !== canonicalJson(record)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `custom field definition drift: ${field.code}`);
        definitions.set(record.sourceIdentitySha256, record);
        for (const logicRecord of definitionLogicRecords(field, evidence)) {
          const existingLogic = definitionLogic.get(logicRecord.sourceIdentitySha256);
          if (existingLogic && canonicalJson(existingLogic) !== canonicalJson(logicRecord)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", `custom field definition logic drift: ${field.code}`);
          definitionLogic.set(logicRecord.sourceIdentitySha256, logicRecord);
        }
        records.push(customValueRecord(row, field, employeeSourceIdentitySha256));
      }
    }
    records.push({
      sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`,
      sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, targetTable: rule.targetTable,
      dependencyMode: "employee", dependencyRefs: employeeSourceIdentitySha256 ? [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employeeSourceIdentitySha256 }] : [],
      disposition: canLoad ? "insert" : "quarantine",
      ...(canLoad ? { payload: payloadForT5Record(row, rule) } : { quarantineReason: row.materialized.disposition === "quarantined" ? "SOURCE_MATERIALIZATION_QUARANTINED" : "EMPLOYEE_NOT_MAPPED" }),
    });
  }
  return { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_payload_stage", phase: "T5", triple: structuredClone(input.triple), sourceSnapshotHash: input.stageManifest.sourceSnapshotHash, sourceRestoreReceiptSha256: input.stageManifest.sourceRestoreReceiptSha256, sourceBusinessSha256: input.stageManifest.nonfileBusinessSha256, mappingContractSha256: input.stageManifest.mappingContractSha256, t0DecisionArtifactSha256: input.stageManifest.t0DecisionArtifactSha256, t0TargetIdentitySha256: input.stageManifest.t0TargetIdentitySha256, t0TargetScopeSha256: input.stageManifest.t0TargetScopeSha256, records: [...definitions.values(), ...definitionLogic.values(), ...records], productionImport: "HOLD" };
}
