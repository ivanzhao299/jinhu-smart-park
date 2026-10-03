-- Synthetic, disposable DB only. Minimal predecessor relations retain exact
-- observer columns; this is NOT a full migration/production-order rehearsal.
CREATE EXTENSION pgcrypto;
CREATE TABLE hr_yuzhou_t5_followon_operation(operation_id text PRIMARY KEY,parent_operation_id text,status text,binding jsonb);
CREATE TABLE hr_yuzhou_production_import_operation(operation_id text PRIMARY KEY,status text,target_tenant_id text,target_park_id text,
 code_sha text,source_snapshot_sha256 text,mapping_contract_sha256 text,sealed_plan_sha256 text,target_identity_sha256 text,target_scope_sha256 text,execution_contract_version int);
CREATE TABLE migration_batch(id uuid PRIMARY KEY,t5_followon_operation_id text,run_id text,execution_context text,status text,target_database text,
 production_import_operation_id text,production_import_phase text);
CREATE TABLE hr_yuzhou_t5_followon_source(id uuid PRIMARY KEY,operation_id text,tenant_id text,park_id text,source_domain text,source_table text,
 source_identity_sha256 text,source_row_sha256 text,owner_status text,employee_id uuid,owner_record_map_id uuid);
CREATE TABLE hr_yuzhou_t5_followon_projection_receipt(operation_id text,target_table text,source_identity_sha256 text,source_row_sha256 text,
 target_id uuid,disposition text,reason_code text);
CREATE TABLE legacy_record_map(id uuid PRIMARY KEY,target_id uuid,target_table text,source_system text,source_table text,is_active boolean,
 mapping_status text,source_pk_canonical text,source_identity_sha256 text,source_row_sha256 text,batch_id uuid);
CREATE TABLE hr_yuzhou_production_import_record(operation_id text,phase text,source_identity_sha256 text,source_row_sha256 text,
 source_system text,source_table text,source_pk_canonical text,target_table text,target_id uuid,disposition text,rollback_status text);
CREATE TABLE hr_yuzhou_production_import_phase(operation_id text,phase text,status text);
CREATE TABLE hr_yuzhou_production_import_projection_receipt(operation_id text,phase text,source_identity_sha256 text,legacy_record_map_id uuid,migration_batch_id uuid);
CREATE TABLE IF NOT EXISTS hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,is_deleted boolean,employment_status text,user_id uuid);
CREATE TABLE hr_legacy_identity_registry(id uuid PRIMARY KEY,tenant_id text,park_id text,source_system text,source_table text,
 source_identity_sha256 text,source_row_sha256 text,mapping_status text,owner_employee_id uuid,owner_record_map_id uuid,
 owner_source_system text,owner_source_table text,owner_source_identity_sha256 text);
CREATE TABLE hr_legacy_archive_record(id uuid PRIMARY KEY,identity_registry_id uuid,tenant_id text,park_id text,restricted_safe_projection jsonb);
CREATE TABLE IF NOT EXISTS hr_employee_profile(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_id uuid,is_deleted boolean,
 legacy_source_identity_sha256 text,legacy_source_row_sha256 text,native_place varchar(50),degree varchar(50),note text,version integer NOT NULL DEFAULT 1,update_time timestamptz NOT NULL DEFAULT now(),update_by uuid);
ALTER TABLE hr_employee_profile ADD COLUMN IF NOT EXISTS note text;
