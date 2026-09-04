import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL,
  PRODUCTION_IMPORT_T5_NONFILE_TARGET_TABLES,
  ProductionImportT5NonfileTargetModelError,
  validateProductionImportT5NonfileTargetModel,
} from "../hr-cutover/production-import-t5-nonfile-target-model.mjs";

test("T5 nonfile production model includes the reviewed employee and custom-field targets", () => {
  assert.deepEqual([...PRODUCTION_IMPORT_T5_NONFILE_TARGET_TABLES].sort(), ["hr_custom_field_definition", "hr_custom_field_legacy_logic_fingerprint", "hr_employee_credential", "hr_employee_custom_value", "hr_employee_family", "hr_employee_profile", "hr_employee_skill"]);
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.phase, "T5");
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.productionImport, "HOLD");
  assert.deepEqual(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.filesExcluded, ["photo", "docs"]);
  for (const rule of Object.values(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.targetTables)) {
    assert.equal(rule.writeMode, "insert_only");
  }
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.targetTables.hr_custom_field_definition.dependency, "none");
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.targetTables.hr_custom_field_legacy_logic_fingerprint.dependency, "custom_field_definition");
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.targetTables.hr_employee_custom_value.dependency, "employee_custom_field");
});

test("T5 nonfile model rejects an attempt to add files, an unreviewed table, or a merge path", () => {
  for (const mutate of [
    value => { value.filesExcluded = ["photo"]; },
    value => { value.targetTables.hr_employee_document = structuredClone(value.targetTables.hr_employee_skill); },
    value => { value.targetTables.hr_employee_skill.writeMode = "merge"; },
  ]) {
    const value = structuredClone(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL);
    mutate(value);
    assert.throws(() => validateProductionImportT5NonfileTargetModel(value), ProductionImportT5NonfileTargetModelError);
  }
});
