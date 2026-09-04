import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const sql = readFileSync(resolve(root, "database/migrations/000289_hr_yuzhou_production_import_t5_nonfile_control.sql"), "utf8");
const customFieldSql = readFileSync(resolve(root, "database/migrations/000292_hr_yuzhou_production_import_t5_custom_fields.sql"), "utf8");
const legacyRuleSql = readFileSync(resolve(root, "database/migrations/000293_hr_custom_field_legacy_rule_metadata.sql"), "utf8");

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

test("T5 custom-field control adds only normalized definition and value targets with typed dependencies", () => {
  for (const table of ["hr_custom_field_definition", "hr_employee_custom_value"]) {
    assert.match(customFieldSql, new RegExp(`phase='T5'[^;]*${table}`, "s"));
  }
  assert.match(customFieldSql, /WHEN 'hr_custom_field_definition' THEN NULL/);
  assert.match(customFieldSql, /WHEN 'hr_employee_custom_value' THEN[\s\S]*employee:hr_employee[\s\S]*custom_field_definition:hr_custom_field_definition/);
  assert.doesNotMatch(customFieldSql, /hr_payroll|photo|attachment|file_object/i);
  assert.match(customFieldSql, /^BEGIN;/m);
  assert.match(customFieldSql, /COMMIT;\s*$/);
});

test("T5 legacy-rule control admits only the non-executable logic fingerprint target", () => {
  assert.match(legacyRuleSql, /^BEGIN;/m);
  assert.match(legacyRuleSql, /phase='T5'[^;]*hr_custom_field_legacy_logic_fingerprint/s);
  assert.match(legacyRuleSql, /planned_target_table IN \([^;]*hr_custom_field_legacy_logic_fingerprint/s);
  assert.match(
    legacyRuleSql,
    /WHEN 'hr_custom_field_legacy_logic_fingerprint' THEN v_required := ARRAY\['custom_field_definition:hr_custom_field_definition'\]/,
  );
  assert.match(legacyRuleSql, /CHECK\s*\(\s*execution='forbidden'\s*\)/);
  assert.doesNotMatch(legacyRuleSql, /hr_payroll|photo|attachment|file_object/i);
  assert.match(legacyRuleSql, /COMMIT;\s*$/);
});
