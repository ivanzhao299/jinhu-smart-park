#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const read=path=>readFileSync(resolve(ROOT,path),"utf8");
const migration=read("database/migrations/000280_hr_legacy_archive_materialization_control.sql");
const load=read("scripts/materialize-yuzhou-t5-archive-visibility.sh");
const rollback=read("scripts/rollback-yuzhou-t5-archive-visibility.sh");

test("T5A projection is batch-bound and exact-source only",()=>{
  assert.match(migration,/CREATE TABLE hr_legacy_archive_materialization_batch/u);
  assert.match(migration,/source_t5_import_batch_id uuid NOT NULL/u);
  assert.match(migration,/status='unpublished' OR source_record_count=archive_record_count/u);
  assert.match(migration,/deferred_file_count bigint NOT NULL DEFAULT 0/u);
  assert.match(migration,/hr_legacy_t5_record[\s\S]+hr_legacy_t5_file_evidence[\s\S]+HR_LEGACY_ARCHIVE_SOURCE_NOT_EXACT/u);
  assert.match(migration,/owner\.source_system='yuzhou-v10'[\s\S]+owner\.source_table='dbo\.person'[\s\S]+owner\.target_table='hr_employee'/u);
  assert.match(migration,/tenant_id=p_tenant_id AND park_id=p_park_id AND id=p_source_t5_import_batch_id/u);
  assert.doesNotMatch(migration,/full_name|employee_code|username|display_name/iu);
});

test("T5A materializes reviewed non-file archive projections and defers every file",()=>{
  for(const table of ["hr_legacy_identity_registry","hr_legacy_archive_record"]){
    assert.match(migration,new RegExp(`INSERT INTO public\\.${table}`,"u"));
  }
  assert.doesNotMatch(migration,/INSERT INTO public\.hr_legacy_file_blob_object/u);
  assert.doesNotMatch(migration,/INSERT INTO public\.hr_legacy_file_logical_record/u);
  assert.match(migration,/SELECT count\(\*\) INTO deferred_file_count FROM public\.hr_legacy_t5_file_evidence/u);
  assert.doesNotMatch(migration,/record_payload->>/u);
  assert.doesNotMatch(migration,/'sourceTable'/u);
  assert.match(migration,/legacy_source_row_sha256=source\.source_row_sha256/u);
  for(const forbidden of ["hr_employee ","hr_payroll_run","hr_payslip","biz_user_message","sys_file"]){
    assert.doesNotMatch(migration,new RegExp(`INSERT INTO public\\.${forbidden.trim()}`,"u"));
  }
});

test("T5A apply and rollback require an isolated target and a temporary least-privilege role",()=>{
  assert.match(migration,/session_user!~'\^yuzhou_t5a_apply_/u);
  assert.match(migration,/session_user!~'\^yuzhou_t5a_rollback_/u);
  assert.match(migration,/yuzhou_t5a_apply_\[0-9a-f\]\{16\}/u);
  assert.match(migration,/yuzhou_t5a_rollback_\[0-9a-f\]\{16\}/u);
  assert.match(migration,/current_database\(\)!~'\^jinhu_hr_migration_lab_/u);
  assert.match(migration,/current_setting\('transaction_isolation'\)<>'serializable'/u);
  assert.match(migration,/SECURITY DEFINER SET search_path=pg_catalog,public/u);
  assert.match(migration,/REVOKE ALL ON PROCEDURE materialize_yuzhou_t5_archive_visibility/u);
  assert.match(migration,/REVOKE ALL ON PROCEDURE rollback_yuzhou_t5_archive_visibility/u);
  for(const script of [load,rollback]){
    assert.match(script,/\^jinhu_hr_migration_lab_/u);
    assert.match(script,/com\.docker\.compose\.project/u);
    assert.match(script,/NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/u);
    assert.match(script,/REVOKE ALL ON ALL TABLES/u);
    assert.match(script,/trap cleanup_role_best_effort EXIT HUP INT TERM/u);
    assert.match(script,/openssl rand -hex 8/u);
    assert.match(script,/CREATE ROLE \$ROLE NOLOGIN/u);
    assert.doesNotMatch(script,/IF NOT EXISTS\(SELECT 1 FROM pg_roles/u);
    assert.match(script,/DROP ROLE \$ROLE/u);
    assert.match(script,/BEGIN ISOLATION LEVEL SERIALIZABLE/u);
  }
  assert.match(load,/GRANT EXECUTE ON PROCEDURE materialize_yuzhou_t5_archive_visibility/u);
  assert.match(rollback,/ALLOW_YUZHOU_ROLLBACK/u);
  assert.match(rollback,/GRANT EXECUTE ON PROCEDURE rollback_yuzhou_t5_archive_visibility/u);
});

test("T5A rollback is exact, reverse ordered and retains the immutable batch receipt",()=>{
  const archive=migration.indexOf("DELETE FROM public.hr_legacy_archive_record");
  const identity=migration.indexOf("DELETE FROM public.hr_legacy_identity_registry");
  assert(archive>0&&identity>archive);
  assert.match(migration,/present_count<>expected_count/u);
  assert.match(migration,/status='rolled_back'/u);
  assert.match(migration,/T5A rollback residual is nonzero/u);
  assert.doesNotMatch(migration,/DELETE FROM public\.hr_legacy_archive_materialization_batch/u);
  assert.doesNotMatch(migration,/session_replication_role/u);
  assert.doesNotMatch(migration,/DISABLE TRIGGER/u);
});

test("ordinary deploy and production seed remain unable to reach T5A procedures",()=>{
  for(const path of [".github/workflows/deploy-production.yml","scripts/prod-deploy.sh","scripts/db-seed-prod.sh","scripts/hr-cutover/full-domain-lifecycle.sh"]){
    const source=read(path);
    assert.doesNotMatch(source,/materialize-yuzhou-t5-archive-visibility|materialize_yuzhou_t5_archive_visibility|rollback_yuzhou_t5_archive_visibility/u,path);
  }
});
