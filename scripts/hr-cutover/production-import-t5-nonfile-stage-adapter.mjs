import { createHash } from "node:crypto";

import { DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL } from "./production-import-t5-nonfile-target-model.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const STAGED_SKILL_KEYS = ["domain", "employeeCode", "materialized", "sourceIdentitySha256", "sourceKey", "sourceRowSha256", "sourceTable"];
const MATERIALIZED_SKILL_KEYS = ["disposition", "gaps", "kind", "legacyGrade", "note", "proficiency", "skillName"];
const EMPLOYEE_INDEX_KEYS = ["employeeCode", "sourceIdentitySha256"];

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
