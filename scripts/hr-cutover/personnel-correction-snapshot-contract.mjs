// Fixed, reviewed projection. No caller-provided SQL, relation or column names.
// Source ciphertext/object references are intentionally outside this contract.
export const snapshotColumns = Object.freeze({
 hr_yuzhou_t5_followon_operation: 'operation_id parent_operation_id payroll_operation_id binding_sha256 binding status owned_state photo_state created_at finished_at rolled_back_at',
 hr_yuzhou_production_import_operation: 'operation_id intent status code_sha source_snapshot_sha256 mapping_contract_sha256 sealed_plan_sha256 target_identity_sha256 authorization_artifact_sha256 authorization_nonce_sha256 authorization_issued_at authorization_expires_at window_starts_at window_ends_at approval_set_sha256 manifest_sha256 final_rehearsal_pair_sha256 rehearsal_a_manifest_sha256 rehearsal_b_manifest_sha256 phase_order current_phase failure_code authorized_at started_at finished_at execution_contract_version target_tenant_id target_park_id target_scope_sha256',
 migration_batch: 'id run_id source_system source_snapshot_sha256 target_database phase status tool_version counts started_at finished_at create_time update_time execution_context production_import_operation_id production_import_phase production_import_actor_id t4_followon_operation_id t5_followon_operation_id',
 hr_yuzhou_t5_followon_source: 'id operation_id tenant_id park_id source_domain source_table source_identity_sha256 source_row_sha256 owner_status employee_id owner_record_map_id create_time',
 hr_yuzhou_t5_followon_projection_receipt: 'operation_id target_table source_identity_sha256 source_row_sha256 disposition target_id reason_code',
 legacy_record_map: 'id batch_id source_system source_table source_pk_canonical source_identity_sha256 source_row_sha256 target_table target_id mapping_status is_active create_time update_time',
 hr_yuzhou_production_import_record: 'operation_id phase source_identity_sha256 source_row_sha256 owner_source_identity_sha256 disposition target_table target_id expected_target_before_sha256 target_after_sha256 decision_attestation_sha256 rollback_status rolled_back_at planned_target_table source_system source_table source_pk_canonical business_identity_sha256 expected_target_version_before target_version_after',
 hr_yuzhou_production_import_phase: 'operation_id phase phase_ordinal status source_batch_manifest_sha256 planned_record_count applied_record_count before_canonical_sha256 after_canonical_sha256 rollback_canonical_sha256 started_at finished_at payload_bundle_artifact_sha256 payload_bundle_sha256 canonicalization_version',
 hr_yuzhou_production_import_projection_receipt: 'operation_id phase source_identity_sha256 migration_batch_id legacy_record_map_id created_at',
 hr_employee: 'id tenant_id park_id employee_code full_name user_id primary_org_id position_id manager_employee_id employment_type employment_status hire_date probation_end_date departure_date work_location work_mobile work_email create_by create_time update_by update_time is_deleted version remark attendance_card_no legacy_jobstate_code legacy_jobstate_name',
 hr_legacy_identity_registry: 'id tenant_id park_id source_system source_table source_identity_sha256 source_row_sha256 identity_kind mapping_status owner_employee_id owner_record_map_id owner_source_system owner_source_table owner_source_identity_sha256 resolution_reason_code resolved_by resolved_at create_time update_time',
 hr_legacy_archive_record: 'id tenant_id park_id identity_registry_id record_type occurred_on display_title display_safe_projection restricted_safe_projection create_time',
 hr_employee_profile: 'id tenant_id park_id employee_id id_type id_number_masked personal_mobile personal_email address emergency_contact_name emergency_contact_mobile create_by create_time update_by update_time is_deleted version remark id_number_encrypted id_number_fingerprint english_name gender date_of_birth ethnicity native_place political_status party_join_date height_cm weight_kg marital_status health_status household_registration highest_education major degree foreign_language language_level graduation_date graduation_school home_phone job_title job_grade employee_category technical_title technical_grade legacy_basic_info_id source_snapshot legacy_source_identity_sha256 legacy_source_row_sha256 legacy_professional_title_code',
});
export const snapshotRelations = Object.freeze(Object.keys(snapshotColumns));
const sources = `SELECT ${snapshotColumns.hr_yuzhou_t5_followon_source.split(' ').map(c=>`s.${c}`).join(',')} FROM public.hr_yuzhou_t5_followon_source s WHERE s.operation_id=$3 AND s.source_domain='person_core'`;
const receipts = `SELECT r.* FROM public.hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=$3 AND r.target_table IN ('hr_yuzhou_t5_followon_source','hr_employee_profile','hr_legacy_identity_registry','hr_legacy_archive_record') AND r.source_identity_sha256 IN (SELECT source_identity_sha256 FROM snap_sources)`;
const profiles = `SELECT p.* FROM public.hr_employee_profile p WHERE (p.tenant_id=$1 AND p.park_id=$2) OR p.id IN (SELECT target_id FROM snap_receipts WHERE target_table='hr_employee_profile')`;
const employees = `SELECT e.* FROM public.hr_employee e WHERE (e.tenant_id=$1 AND e.park_id=$2) OR e.id IN (SELECT employee_id FROM snap_sources UNION SELECT employee_id FROM snap_profiles)`;
const maps = `SELECT m.* FROM public.legacy_record_map m WHERE m.id IN (SELECT owner_record_map_id FROM snap_sources) OR (m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.target_id IN (SELECT id FROM snap_employees))`;
const registries = `SELECT r.* FROM public.hr_legacy_identity_registry r WHERE (r.tenant_id=$1 AND r.park_id=$2 AND r.source_table='dbo.person.core_residue') OR r.id IN (SELECT target_id FROM snap_receipts WHERE target_table='hr_legacy_identity_registry')`;
const closure = `WITH snap_binding AS (SELECT $1::text tenant_id,$2::text park_id,$3::text source_operation_id,$4::text parent_operation_id),snap_sources AS (${sources}),snap_receipts AS (${receipts}),snap_profiles AS (${profiles}),snap_employees AS (${employees}),snap_maps AS (${maps}),snap_registries AS (${registries})`;
const where = Object.freeze({
 hr_yuzhou_t5_followon_operation: 't.operation_id=$3',
 hr_yuzhou_production_import_operation: 't.operation_id=$4',
 migration_batch: 't.t5_followon_operation_id=$3 OR (t.production_import_operation_id=$4 AND t.production_import_phase=\'T0\') OR t.id IN (SELECT batch_id FROM snap_maps)',
 hr_yuzhou_t5_followon_source: 't.id IN (SELECT id FROM snap_sources)',
 hr_yuzhou_t5_followon_projection_receipt: "t.operation_id=$3 AND t.target_table IN ('hr_yuzhou_t5_followon_source','hr_employee_profile','hr_legacy_identity_registry','hr_legacy_archive_record') AND t.source_identity_sha256 IN (SELECT source_identity_sha256 FROM snap_sources)",
 legacy_record_map: 't.id IN (SELECT id FROM snap_maps)',
 hr_yuzhou_production_import_record: "t.operation_id=$4 AND t.phase='T0'",
 hr_yuzhou_production_import_phase: "t.operation_id=$4 AND t.phase='T0'",
 hr_yuzhou_production_import_projection_receipt: "t.operation_id=$4 AND t.phase='T0'",
 hr_employee: 't.id IN (SELECT id FROM snap_employees)',
 hr_legacy_identity_registry: 't.id IN (SELECT id FROM snap_registries)',
 hr_legacy_archive_record: "t.identity_registry_id IN (SELECT id FROM snap_registries) OR t.id IN (SELECT target_id FROM snap_receipts WHERE target_table='hr_legacy_archive_record')",
 hr_employee_profile: 't.id IN (SELECT id FROM snap_profiles)',
});
export const snapshotCaptureQueries = Object.freeze(Object.fromEntries(snapshotRelations.map(name => [name,
 `${closure} SELECT ${snapshotColumns[name].split(' ').map(c => `t.${c}`).join(',')}${name==='hr_employee_profile' ? ',t.xmin::text AS origin_xmin' : ''} FROM public.${name} t WHERE ${where[name]}`])));
export function snapshotAggregateSql(query) {
 return `SELECT count(*)::int count,COALESCE(jsonb_agg(to_jsonb(q) ORDER BY to_jsonb(q)::text COLLATE "C"),'[]'::jsonb)::text rows FROM (${query}) q`;
}
export const snapshotSchemaSql = `SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname COLLATE "C",a.attnum`;
