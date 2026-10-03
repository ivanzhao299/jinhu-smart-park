BEGIN;
-- Empty independent snapshot infrastructure. No trust registration or business data.
CREATE SCHEMA hr_correction_snapshot;
REVOKE ALL ON SCHEMA hr_correction_snapshot FROM PUBLIC;
CREATE TABLE hr_correction_snapshot.origin_registry (
 registry_id uuid PRIMARY KEY, lab_id uuid NOT NULL UNIQUE REFERENCES public.hr_personnel_correction_lab(lab_id),
 origin_database text NOT NULL CHECK(length(origin_database) BETWEEN 1 AND 128),
 origin_identity_sha256 char(64) NOT NULL CHECK(origin_identity_sha256~'^[0-9a-f]{64}$'),
 migration_history_sha256 char(64) NOT NULL CHECK(migration_history_sha256~'^[0-9a-f]{64}$'),
 tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 source_operation_id varchar(64) NOT NULL,parent_operation_id varchar(64) NOT NULL,
 triple jsonb NOT NULL,contract_sha256 char(64) NOT NULL CHECK(contract_sha256~'^[0-9a-f]{64}$'),
 authority_public_key text NOT NULL,expires_at timestamptz NOT NULL,
 registered_by name NOT NULL DEFAULT current_user
);
CREATE TABLE hr_correction_snapshot.prepare_approval (
 snapshot_id uuid PRIMARY KEY,registry_id uuid NOT NULL UNIQUE REFERENCES hr_correction_snapshot.origin_registry,
 manifest_sha256 char(64) NOT NULL CHECK(manifest_sha256~'^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL, registered_by name NOT NULL DEFAULT current_user
);
CREATE TABLE hr_correction_snapshot.manifest (
 snapshot_id uuid PRIMARY KEY REFERENCES hr_correction_snapshot.prepare_approval,
 singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 payload text NOT NULL,signature text NOT NULL,execution_xid xid8 NOT NULL DEFAULT pg_current_xact_id()
);
CREATE FUNCTION hr_correction_snapshot.guard_trust() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
DECLARE executor name;
BEGIN
 IF current_database()!~'^jinhu_hr_correction_lab_[0-9a-f]{24}$' THEN RAISE EXCEPTION 'SNAPSHOT_LAB_REQUIRED'; END IF;
 IF TG_TABLE_NAME='origin_registry' THEN
  SELECT database_user INTO executor FROM public.hr_personnel_correction_lab WHERE lab_id=NEW.lab_id AND database_name=current_database();
 ELSE
  SELECT l.database_user INTO executor FROM hr_correction_snapshot.origin_registry r
   JOIN public.hr_personnel_correction_lab l USING(lab_id) WHERE r.registry_id=NEW.registry_id;
 END IF;
 IF executor IS NULL OR executor=current_user OR NEW.registered_by<>current_user OR NEW.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'SNAPSHOT_INDEPENDENT_CUSTODIAN_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trust_origin BEFORE INSERT ON hr_correction_snapshot.origin_registry FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_trust();
CREATE TRIGGER trust_prepare BEFORE INSERT ON hr_correction_snapshot.prepare_approval FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_trust();
CREATE FUNCTION hr_correction_snapshot.guard_insert() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_database()!~'^jinhu_hr_correction_lab_[0-9a-f]{24}$' THEN RAISE EXCEPTION 'SNAPSHOT_LAB_REQUIRED'; END IF;
 IF TG_TABLE_NAME='manifest' THEN
  IF NOT EXISTS(SELECT 1 FROM hr_correction_snapshot.prepare_approval a
    JOIN hr_correction_snapshot.origin_registry r USING(registry_id)
    JOIN public.hr_personnel_correction_lab l USING(lab_id)
    WHERE a.snapshot_id=NEW.snapshot_id AND l.database_name=current_database() AND l.database_user=current_user
    AND a.manifest_sha256=encode(public.digest(convert_to(NEW.payload||E'\n'||NEW.signature,'UTF8'),'sha256'),'hex')
    AND a.expires_at>clock_timestamp() AND r.expires_at>clock_timestamp()
    AND NEW.execution_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'SNAPSHOT_PREPARE_APPROVAL_REQUIRED'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM hr_correction_snapshot.manifest WHERE execution_xid=pg_current_xact_id())
 THEN RAISE EXCEPTION 'SNAPSHOT_STAGING_CLOSED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER insert_manifest BEFORE INSERT ON hr_correction_snapshot.manifest FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_t5_followon_operation AS SELECT operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status,owned_state,photo_state,created_at,finished_at,rolled_back_at FROM public.hr_yuzhou_t5_followon_operation WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_t5_followon_operation FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_production_import_operation AS SELECT operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,current_phase,failure_code,authorized_at,started_at,finished_at,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256 FROM public.hr_yuzhou_production_import_operation WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_production_import_operation FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.migration_batch AS SELECT id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,counts,started_at,finished_at,create_time,update_time,execution_context,production_import_operation_id,production_import_phase,production_import_actor_id,t4_followon_operation_id,t5_followon_operation_id FROM public.migration_batch WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.migration_batch FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_t5_followon_source AS SELECT id,operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,owner_status,employee_id,owner_record_map_id,create_time FROM public.hr_yuzhou_t5_followon_source WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_t5_followon_source FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_t5_followon_projection_receipt AS SELECT operation_id,target_table,source_identity_sha256,source_row_sha256,disposition,target_id,reason_code FROM public.hr_yuzhou_t5_followon_projection_receipt WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_t5_followon_projection_receipt FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.legacy_record_map AS SELECT id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active,create_time,update_time FROM public.legacy_record_map WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.legacy_record_map FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_production_import_record AS SELECT operation_id,phase,source_identity_sha256,source_row_sha256,owner_source_identity_sha256,disposition,target_table,target_id,expected_target_before_sha256,target_after_sha256,decision_attestation_sha256,rollback_status,rolled_back_at,planned_target_table,source_system,source_table,source_pk_canonical,business_identity_sha256,expected_target_version_before,target_version_after FROM public.hr_yuzhou_production_import_record WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_production_import_record FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_production_import_phase AS SELECT operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,applied_record_count,before_canonical_sha256,after_canonical_sha256,rollback_canonical_sha256,started_at,finished_at,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version FROM public.hr_yuzhou_production_import_phase WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_production_import_phase FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_yuzhou_production_import_projection_receipt AS SELECT operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id,created_at FROM public.hr_yuzhou_production_import_projection_receipt WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_yuzhou_production_import_projection_receipt FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_employee AS SELECT id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,position_id,manager_employee_id,employment_type,employment_status,hire_date,probation_end_date,departure_date,work_location,work_mobile,work_email,create_by,create_time,update_by,update_time,is_deleted,version,remark,attendance_card_no,legacy_jobstate_code,legacy_jobstate_name FROM public.hr_employee WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_employee FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_legacy_identity_registry AS SELECT id,tenant_id,park_id,source_system,source_table,source_identity_sha256,source_row_sha256,identity_kind,mapping_status,owner_employee_id,owner_record_map_id,owner_source_system,owner_source_table,owner_source_identity_sha256,resolution_reason_code,resolved_by,resolved_at,create_time,update_time FROM public.hr_legacy_identity_registry WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_legacy_identity_registry FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_legacy_archive_record AS SELECT id,tenant_id,park_id,identity_registry_id,record_type,occurred_on,display_title,display_safe_projection,restricted_safe_projection,create_time FROM public.hr_legacy_archive_record WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_legacy_archive_record FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TABLE hr_correction_snapshot.hr_employee_profile AS SELECT id,tenant_id,park_id,employee_id,id_type,id_number_masked,personal_mobile,personal_email,address,emergency_contact_name,emergency_contact_mobile,create_by,create_time,update_by,update_time,is_deleted,version,remark,id_number_encrypted,id_number_fingerprint,english_name,gender,date_of_birth,ethnicity,native_place,political_status,party_join_date,height_cm,weight_kg,marital_status,health_status,household_registration,highest_education,major,degree,foreign_language,language_level,graduation_date,graduation_school,home_phone,job_title,job_grade,employee_category,technical_title,technical_grade,legacy_basic_info_id,source_snapshot,legacy_source_identity_sha256,legacy_source_row_sha256,legacy_professional_title_code,xmin::text AS origin_xmin FROM public.hr_employee_profile WITH NO DATA;
CREATE TRIGGER insert_snapshot BEFORE INSERT ON hr_correction_snapshot.hr_employee_profile FOR EACH ROW EXECUTE FUNCTION hr_correction_snapshot.guard_insert();
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.origin_registry FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.origin_registry FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.prepare_approval FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.prepare_approval FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.manifest FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.manifest FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_t5_followon_operation FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_t5_followon_operation FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_production_import_operation FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_production_import_operation FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.migration_batch FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.migration_batch FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_t5_followon_source FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_t5_followon_source FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_t5_followon_projection_receipt FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_t5_followon_projection_receipt FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.legacy_record_map FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.legacy_record_map FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_production_import_record FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_production_import_record FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_production_import_phase FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_production_import_phase FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_yuzhou_production_import_projection_receipt FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_yuzhou_production_import_projection_receipt FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_employee FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_employee FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_legacy_identity_registry FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_legacy_identity_registry FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_legacy_archive_record FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_legacy_archive_record FROM PUBLIC;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE OR TRUNCATE ON hr_correction_snapshot.hr_employee_profile FOR EACH STATEMENT EXECUTE FUNCTION public.hr_personnel_correction_immutable();
REVOKE ALL ON hr_correction_snapshot.hr_employee_profile FROM PUBLIC;
COMMIT;
