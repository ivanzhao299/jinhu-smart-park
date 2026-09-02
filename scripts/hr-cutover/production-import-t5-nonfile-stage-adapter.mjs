import { createHash } from "node:crypto";

import { DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL } from "./production-import-t5-nonfile-target-model.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const STAGED_SKILL_KEYS = ["domain", "employeeCode", "materialized", "sourceIdentitySha256", "sourceKey", "sourceRowSha256", "sourceTable"];
const MATERIALIZED_SKILL_KEYS = ["disposition", "gaps", "kind", "legacyGrade", "note", "proficiency", "skillName"];
const EMPLOYEE_INDEX_KEYS = ["employeeCode", "sourceIdentitySha256"];
const RAW_STAGED_RECORD_KEYS = ["domain", "employeeCode", "materialized", "source", "sourceIdentitySha256", "sourceKey", "sourceRowSha256", "sourceTable"];
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
    privateValue(value.idNumber, "profile.idNumber");
    for (const field of ["idType", "gender", "dateOfBirth", "ethnicity", "nativePlace", "politicalStatus", "maritalStatus", "healthStatus", "address", "homePhone", "personalMobile", "personalEmail", "highestEducation", "major", "degree", "graduationSchool", "graduationDate", "foreignLanguage", "jobTitle", "jobGrade"]) nullableString(value[field], `profile.${field}`);
    return { id_type: value.idType, id_number_encrypted: value.idNumber.encrypted, id_number_masked: value.idNumber.masked, id_number_fingerprint: value.idNumber.fingerprint, gender: value.gender, date_of_birth: value.dateOfBirth, ethnicity: value.ethnicity, native_place: value.nativePlace, political_status: value.politicalStatus, marital_status: value.maritalStatus, health_status: value.healthStatus, address: value.address, home_phone: value.homePhone, personal_mobile: value.personalMobile, personal_email: value.personalEmail, highest_education: value.highestEducation, major: value.major, degree: value.degree, graduation_school: value.graduationSchool, graduation_date: value.graduationDate, foreign_language: value.foreignLanguage, job_title: value.jobTitle, job_grade: value.jobGrade, ...base };
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
  exactKeys(input.stageManifest, ["sourceSnapshotHash", "sourceRestoreReceiptSha256", "nonfileBusinessSha256", "productionImport"], "stage manifest");
  if (input.stageManifest.sourceSnapshotHash !== input.triple.sourceSnapshotHash || input.stageManifest.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "stage source binding invalid");
  assertHash(input.stageManifest.sourceRestoreReceiptSha256, "restore receipt");
  assertHash(input.stageManifest.nonfileBusinessSha256, "nonfile business");
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
  exactKeys(input, ["triple", "stageManifest", "employeeIndex", "records"], "input");
  validateTriple(input.triple);
  exactKeys(input.stageManifest, ["sourceSnapshotHash", "sourceRestoreReceiptSha256", "nonfileBusinessSha256", "productionImport"], "stage manifest");
  if (input.stageManifest.sourceSnapshotHash !== input.triple.sourceSnapshotHash || input.stageManifest.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "stage source binding invalid");
  assertHash(input.stageManifest.sourceRestoreReceiptSha256, "restore receipt"); assertHash(input.stageManifest.nonfileBusinessSha256, "nonfile business");
  const employees = validateEmployeeIndex(input.employeeIndex);
  if (!Array.isArray(input.records)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "T5 records must be an array");
  const seen = new Set();
  const records = input.records.map(row => {
    const rule = validateNonfileRecord(row);
    if (seen.has(row.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID", "T5 source identity duplicate");
    seen.add(row.sourceIdentitySha256);
    const employeeSourceIdentitySha256 = employees.get(row.employeeCode);
    const canLoad = row.materialized.disposition === "loaded" && employeeSourceIdentitySha256;
    return {
      sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`,
      sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, targetTable: rule.targetTable,
      dependencyMode: "employee", dependencyRefs: employeeSourceIdentitySha256 ? [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employeeSourceIdentitySha256 }] : [],
      disposition: canLoad ? "insert" : "quarantine",
      ...(canLoad ? { payload: payloadForT5Record(row, rule) } : { quarantineReason: row.materialized.disposition === "quarantined" ? "SOURCE_MATERIALIZATION_QUARANTINED" : "EMPLOYEE_NOT_MAPPED" }),
    };
  });
  return { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_payload_stage", phase: "T5", triple: structuredClone(input.triple), sourceSnapshotHash: input.stageManifest.sourceSnapshotHash, sourceRestoreReceiptSha256: input.stageManifest.sourceRestoreReceiptSha256, sourceBusinessSha256: input.stageManifest.nonfileBusinessSha256, records, productionImport: "HOLD" };
}
