import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const sql = readFileSync(resolve(root, "database/migrations/000289_hr_yuzhou_production_import_t5_nonfile_control.sql"), "utf8");

test("T5 nonfile control migration extends only the explicit production import allowlists", () => {
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /\('T5',4\)/);
  for (const table of ["hr_employee_profile", "hr_employee_family", "hr_employee_skill", "hr_employee_credential"]) {
    assert.match(sql, new RegExp(`phase='T5'[^;]*${table}`, "s"));
  }
  assert.match(sql, /production_import_phase IN \('T0','T1','T2','T3','T5'\)/);
  for (const table of ["hr_employee_profile", "hr_employee_family", "hr_employee_skill", "hr_employee_credential"]) {
    assert.match(sql, new RegExp(`WHEN '${table}' THEN IF v_record\\.disposition='quarantine' THEN v_optional := ARRAY\\['employee:hr_employee'\\]; ELSE v_required := ARRAY\\['employee:hr_employee'\\]; END IF`));
  }
  assert.doesNotMatch(sql, /hr_payroll|photo|attachment|file_object/i);
  assert.match(sql, /COMMIT;\s*$/);
});
