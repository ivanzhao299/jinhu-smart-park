import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL,
  PRODUCTION_IMPORT_T5_NONFILE_TARGET_TABLES,
  ProductionImportT5NonfileTargetModelError,
  validateProductionImportT5NonfileTargetModel,
} from "../hr-cutover/production-import-t5-nonfile-target-model.mjs";

test("T5 nonfile production model is limited to the four reviewed employee domains", () => {
  assert.deepEqual([...PRODUCTION_IMPORT_T5_NONFILE_TARGET_TABLES].sort(), ["hr_employee_credential", "hr_employee_family", "hr_employee_profile", "hr_employee_skill"]);
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.phase, "T5");
  assert.equal(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.productionImport, "HOLD");
  assert.deepEqual(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.filesExcluded, ["photo", "docs"]);
  for (const rule of Object.values(DEFAULT_PRODUCTION_IMPORT_T5_NONFILE_TARGET_MODEL.targetTables)) {
    assert.equal(rule.dependency, "employee");
    assert.equal(rule.writeMode, "insert_only");
  }
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
