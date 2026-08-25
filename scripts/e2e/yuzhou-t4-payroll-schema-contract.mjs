#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"../..");
const migration=readFileSync(resolve(root,"database/migrations/000248_hr_payroll_legacy_history.sql"),"utf8");
const seed=readFileSync(resolve(root,"database/seeds/production/000018_hr_payroll_history_rbac.sql"),"utf8");
const entities=readFileSync(resolve(root,"apps/api/src/modules/hr/entities/hr.entities.ts"),"utf8");
const shared=readFileSync(resolve(root,"packages/shared/src/hr.ts"),"utf8");

for(const table of ["hr_payroll_book","hr_payroll_item_definition","hr_payroll_item_version","hr_payroll_formula_version","hr_payroll_book_period","hr_payroll_legacy_batch","hr_payroll_legacy_snapshot","hr_payroll_legacy_snapshot_item","hr_payroll_review_case"]){
  assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  assert.match(entities,new RegExp(`@Entity\\("${table}"\\)`));
}
assert.match(migration,/numeric\(20,4\)/);
assert.match(migration,/scale\(decimal_value\)<=4/);
assert.match(migration,/status IN \('unpublished','staged','failed','published'\)/);
assert.match(migration,/parse_status IN \('parsed','manual_review','rejected','approved_for_simulation'\)/);
assert.match(migration,/ck_hr_payroll_formula_item_resolution CHECK \(item_version_id IS NOT NULL OR parse_status IN \('manual_review','rejected'\)\)/);
assert.match(migration,/mapping_status='employee_unmapped' AND employee_id IS NULL/);
assert.match(migration,/value_type IN \('decimal','text','date','unmapped'\)/);
assert.match(migration,/Published legacy payroll batch is immutable/);
assert.match(migration,/Legacy payroll facts are append-only/);
assert.match(migration,/Published or unknown legacy payroll batch rejects new facts/);
assert.match(migration,/BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_legacy_snapshot/);
assert.doesNotMatch(migration,/current_setting\('app\.yuzhou_t4_loader_rollback'/);
assert.match(migration,/Legacy payroll fact deletion requires the dedicated rollback procedure/);
assert.match(migration,/loaded_row_count\+quarantined_row_count=source_row_count/);
assert.match(migration,/FOREIGN KEY \(tenant_id,park_id,employee_id\)/);
for(const index of ["idx_hr_payroll_legacy_batch_replaces_fk","idx_hr_payroll_legacy_snapshot_employee_fk","idx_hr_payroll_legacy_snapshot_item_version_fk","idx_hr_payroll_review_case_snapshot_fk","idx_hr_payroll_review_case_formula_fk"]){
  assert.match(migration,new RegExp(`CREATE INDEX IF NOT EXISTS ${index}[^;]+;`));
  assert.doesNotMatch(migration,new RegExp(`CREATE INDEX IF NOT EXISTS ${index}[^;]+WHERE`));
}
assert.doesNotMatch(migration,/\b(status|state)\s+[^,\n]*(paid|disbursed)/i);
assert.doesNotMatch(migration,/enable_(payment|payroll)|payment_enabled/i);

for(const permission of ["hr:payroll_history:read","hr:payroll_history:team_summary","hr:payroll_history:self_read","hr:payroll_rule:read","hr:payroll_formula:review","hr:payroll_reconciliation:calculate","hr:payroll_reconciliation:review"]){
  assert.ok(shared.includes(permission)); assert.ok(seed.includes(permission));
}
assert.match(seed,/\('DEPARTMENT_MANAGER','hr:payroll_history:team_summary'\)/);
assert.doesNotMatch(seed,/\('DEPARTMENT_MANAGER','hr:payroll_history:read'\)/);
assert.doesNotMatch(seed,/INSERT INTO hr_payroll_(book|legacy|item|formula|review)/);
console.log("Yuzhou T4 payroll history schema contract passed.");
