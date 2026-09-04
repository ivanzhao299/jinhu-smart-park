import { readFileSync } from "node:fs";

const MODEL_URL = new URL("./contracts/production-import-t5-nonfile-target-model-v1.json", import.meta.url);
const TARGETS = Object.freeze({
  hr_employee_profile: Object.freeze({ sourceTable: "dbo.person.core_residue", dependency: "employee", recordKind: "profile", identityColumns: ["legacy_source_identity_sha256", "legacy_source_row_sha256"] }),
  hr_employee_family: Object.freeze({ sourceTable: "dbo.family", dependency: "employee", recordKind: "family", identityColumns: ["legacy_source_identity_sha256", "legacy_source_row_sha256"] }),
  hr_employee_skill: Object.freeze({ sourceTable: "dbo.knowhow", dependency: "employee", recordKind: "skill", identityColumns: ["legacy_source_identity_sha256", "legacy_source_row_sha256"] }),
  hr_employee_credential: Object.freeze({ sourceTable: "dbo.ticket", dependency: "employee", recordKind: "credential", identityColumns: ["legacy_source_identity_sha256", "legacy_source_row_sha256"] }),
  hr_custom_field_definition: Object.freeze({ sourceTable: "dbo.defs", dependency: "none", recordKind: "custom_field_definition", identityColumns: ["source_identity_sha256", "source_row_sha256"] }),
  hr_custom_field_legacy_logic_fingerprint: Object.freeze({ sourceTable: "dbo.defs", dependency: "custom_field_definition", recordKind: "custom_field_definition_logic", identityColumns: ["source_identity_sha256", "source_row_sha256"] }),
  hr_employee_custom_value: Object.freeze({ sourceTable: "dbo.person", dependency: "employee_custom_field", recordKind: "custom_field_value", identityColumns: ["source_identity_sha256", "source_row_sha256"] }),
});

export class ProductionImportT5NonfileTargetModelError extends Error {
  constructor(detail) {
    super(`PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL_INVALID: ${detail}`);
    this.name = "ProductionImportT5NonfileTargetModelError";
    this.code = "PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL_INVALID";
  }
}

const fail = detail => { throw new ProductionImportT5NonfileTargetModelError(detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function exactKeys(value, keys, label) {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(`${label} keys differ`);
}

/**
 * The sensitive record values themselves stay in a private payload bundle. This
 * public, machine-validated model contains only the allowed source and target
 * shapes for the first T5 production slice.
 */
export function validateProductionImportT5NonfileTargetModel(input) {
  exactKeys(input, ["formatVersion", "modelKind", "modelVersion", "phase", "sourceBoundary", "filesExcluded", "sourceSystem", "targetTables", "productionImport"], "model");
  if (input.formatVersion !== 1 || input.modelKind !== "yuzhou_hr_production_import_t5_nonfile_target_model" || input.modelVersion !== "2026-09-04.3" || input.phase !== "T5" || input.sourceBoundary !== "nonfile_employee_profile_family_skill_credential_custom_fields_and_logic" || input.sourceSystem !== "yuzhou-v10" || input.productionImport !== "HOLD") fail("model identity invalid");
  if (!same(input.filesExcluded, ["photo", "docs"])) fail("file boundary invalid");
  if (!object(input.targetTables) || !same(Object.keys(input.targetTables).sort(), Object.keys(TARGETS).sort())) fail("target set invalid");
  for (const [table, expected] of Object.entries(TARGETS)) {
    const rule = input.targetTables[table];
    exactKeys(rule, ["sourceTable", "dependency", "recordKind", "writeMode", "legacyIdentityColumns"], table);
    if (rule.sourceTable !== expected.sourceTable || rule.dependency !== expected.dependency || rule.recordKind !== expected.recordKind || rule.writeMode !== "insert_only" || !same(rule.legacyIdentityColumns, expected.identityColumns)) fail(`${table} rule invalid`);
  }
  return structuredClone(input);
}

export const DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL = validateProductionImportT5NonfileTargetModel(JSON.parse(readFileSync(MODEL_URL, "utf8")));
export const PRODUCTION_IMPORT_T5_NONFILE_TARGET_TABLES = Object.freeze(Object.keys(TARGETS));
