#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(resolve(root, "database/migrations/000248_hr_payroll_legacy_history.sql"), "utf8");
const triggerFix = readFileSync(resolve(root, "database/migrations/000287_hr_yuzhou_projection_map_trigger_owner.sql"), "utf8");
const rollback = readFileSync(resolve(root, "scripts/rollback-yuzhou-t4-payroll-history.sh"), "utf8");
const load = readFileSync(resolve(root, "scripts/sql/load-yuzhou-t4-payroll-history.sql"), "utf8");
const loader = readFileSync(resolve(root, "scripts/load-yuzhou-t4-payroll-history.sh"), "utf8");

for (const pattern of [/SECURITY DEFINER SET search_path=pg_catalog,public/, /session_user <> 'yuzhou_t4_loader'/, /REVOKE ALL ON PROCEDURE rollback_yuzhou_t4_payroll_history/, /Published T4 payroll history cannot be rolled back/, /legacy_record_map[\s\S]*is_active/, /idx_legacy_record_map_t4_rollback[\s\S]*batch_id,target_table,target_id,is_active/, /target_table IN \([\s\S]*'hr_payroll_legacy_batch'[\s\S]*'hr_payroll_review_case'[\s\S]*\)/, /x\.remark='T4 run='\|\|p_run_id/]) assert.match(migration, pattern);
assert.doesNotMatch(migration, /current_setting\('app\.yuzhou_t4_loader_rollback'/);
for (const pattern of [/CREATE OR REPLACE FUNCTION hr_yuzhou_validate_production_projection_map_trigger\(\) RETURNS trigger[\s\S]*SECURITY DEFINER SET search_path=pg_catalog,public/, /FROM public\.hr_yuzhou_production_import_projection_receipt/, /PERFORM public\.hr_yuzhou_assert_production_projection_record/, /REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_projection_map_trigger\(\) FROM PUBLIC/]) assert.match(triggerFix, pattern);

for (const pattern of [/current_setting\('yuzhou.mode'\) NOT IN\('hot_history','cold_archive','full_archive'\)/, /current_setting\('yuzhou.expected_rows'\)::bigint/, /current_setting\('yuzhou.expected_items'\)::bigint/, /T4 selected archive accounting drift/, /full source audit count drift/, /payroll_snapshot_cold_archive/, /T4_FULL_SOURCE_AND_SELECTED_ARCHIVE_ACCOUNTING/, /loaded_source_net IS DISTINCT FROM loaded_target_net/, /ANALYZE legacy_record_map/, /T4 modified T0\/T3 or online payroll state/, /protected_before/, /protected online payroll\/compensation\/attendance\/message state drift/, /INSERT INTO hr_payroll_legacy_snapshot[\s\S]*CASE WHEN c\.disposition='loaded'THEN'mapped'ELSE'employee_unmapped'END[\s\S]*c\.disposition IN\('loaded','employee_unmapped'\)/, /INSERT INTO hr_payroll_legacy_snapshot_item[\s\S]*FROM cls c[\s\S]*WHERE c\.disposition IN\('loaded','employee_unmapped'\) AND c\.source_shard=%L;/, /jsonb_array_length\(j->'values'\)\) FILTER\(WHERE disposition IN\('loaded','employee_unmapped'\)\)/, /loaded_source_net FROM cls[\s\S]*WHERE disposition IN\('loaded','employee_unmapped'\)/, /snapshot_id,case_type,subject_hash,evidence_summary,remark\)[\s\S]*'employee_unmapped'/, /unmapped_employee_rows/, /UNION ALL SELECT c\.id,'hr_payroll_review_case','employee_unmapped:'/]) assert.match(load, pattern);
for (const table of ["hr_payroll_run", "hr_payslip", "hr_payslip_item", "hr_employee_compensation", "hr_attendance_payroll_input_item", "biz_user_message", "hr_payroll_payment", "hr_payroll_bank_export", "hr_payroll_tax_submission", "hr_payroll_outbox"]) assert.match(load, new RegExp(table));
assert.match(load, /FROM \(VALUES\('0',1\)[\s\S]*AS shards\(shard,batch_number\)[\s\S]*\\gexec/);
assert.match(load, /T4_PROGRESS_BATCH=%%\/16/);
assert.doesNotMatch(load, /DISABLE TRIGGER ALL|session_replication_role/);
for (const value of ["YUZHOU_T4_LOAD_MODE", "hot_history", "cold_archive", "full_archive", "EXPECTED_ROWS=37750", "EXPECTED_ITEMS=887140", "EXPECTED_NET=86471046.8900", "EXPECTED_CLOSES=1165", "EXPECTED_ROWS=46092", "EXPECTED_ITEMS=1078020", "EXPECTED_NET=102194056.8000", "EXPECTED_CLOSES=1431", "T4 mode period override rejected"]) assert.match(loader, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const pattern of [/LEFT JOIN hr_payroll_item_definition d[\s\S]*LEFT JOIN hr_payroll_item_version v/, /CASE WHEN v\.id IS NULL THEN'unmapped'/, /case_type,subject_hash,evidence_summary,remark\)[\s\S]*'item_unmapped'/, /UNION ALL SELECT c\.id,'hr_payroll_review_case','item_unmapped:'/]) assert.match(load, pattern);
for (const pattern of [/^printf %s "\$DB"\|grep -Eq '\^jinhu_hr_migration_lab_/m, /com\.docker\.compose\.project/, /NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/, /REVOKE ALL ON ALL TABLES/, /trap cleanup_role EXIT HUP INT TERM/, /ALTER ROLE yuzhou_t4_loader NOLOGIN/, /REVOKE EXECUTE ON PROCEDURE rollback_yuzhou_t4_payroll_history/, /-U yuzhou_t4_loader/, /CALL rollback_yuzhou_t4_payroll_history/]) assert.match(rollback, pattern);

console.log("Yuzhou T4 controlled rollback contract passed.");
