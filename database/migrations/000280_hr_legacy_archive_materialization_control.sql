BEGIN;

-- T5A is a derived read-only projection of one verified T5 history batch.
-- It is deliberately separate from online HR aggregates and from the still-HOLD
-- production-import execution contract.
CREATE TABLE hr_legacy_archive_materialization_batch (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  batch_code varchar(64) NOT NULL,
  source_t5_import_batch_id uuid NOT NULL,
  projection_kind varchar(32) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  source_manifest_sha256 char(64) NOT NULL,
  source_record_count bigint NOT NULL,
  deferred_file_count bigint NOT NULL DEFAULT 0,
  archive_record_count bigint NOT NULL DEFAULT 0,
  status varchar(24) NOT NULL DEFAULT 'unpublished',
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hr_legacy_archive_materialization_source
    FOREIGN KEY(tenant_id,park_id,source_t5_import_batch_id)
    REFERENCES hr_legacy_t5_import_batch(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_archive_materialization_code UNIQUE(tenant_id,park_id,batch_code),
  CONSTRAINT ck_hr_legacy_archive_materialization_code CHECK (batch_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$'),
  CONSTRAINT ck_hr_legacy_archive_materialization_hashes CHECK (
    source_snapshot_sha256 ~ '^[0-9a-f]{64}$' AND source_manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_legacy_archive_materialization_projection CHECK (projection_kind='archive_records'),
  CONSTRAINT ck_hr_legacy_archive_materialization_counts CHECK (
    source_record_count>=0 AND deferred_file_count>=0 AND archive_record_count>=0
    AND (status='unpublished' OR source_record_count=archive_record_count)
  ),
  CONSTRAINT ck_hr_legacy_archive_materialization_status CHECK (status IN ('unpublished','staged','rolled_back'))
);
CREATE UNIQUE INDEX uq_hr_legacy_archive_materialization_scope_id
  ON hr_legacy_archive_materialization_batch(tenant_id,park_id,id);
CREATE UNIQUE INDEX uq_hr_legacy_archive_materialization_active_source
  ON hr_legacy_archive_materialization_batch(tenant_id,park_id,source_t5_import_batch_id,projection_kind)
  WHERE status<>'rolled_back';

ALTER TABLE hr_legacy_identity_registry
  ADD COLUMN materialization_batch_id uuid,
  ADD CONSTRAINT fk_hr_legacy_identity_materialization
    FOREIGN KEY(tenant_id,park_id,materialization_batch_id)
    REFERENCES hr_legacy_archive_materialization_batch(tenant_id,park_id,id);
CREATE INDEX ix_hr_legacy_identity_materialization
  ON hr_legacy_identity_registry(tenant_id,park_id,materialization_batch_id)
  WHERE materialization_batch_id IS NOT NULL;

ALTER TABLE hr_legacy_archive_record
  ADD COLUMN materialization_batch_id uuid,
  ADD CONSTRAINT fk_hr_legacy_archive_materialization
    FOREIGN KEY(tenant_id,park_id,materialization_batch_id)
    REFERENCES hr_legacy_archive_materialization_batch(tenant_id,park_id,id);
CREATE INDEX ix_hr_legacy_archive_materialization
  ON hr_legacy_archive_record(tenant_id,park_id,materialization_batch_id)
  WHERE materialization_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hr_assert_legacy_materialization_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE batch_row hr_legacy_archive_materialization_batch%ROWTYPE;
DECLARE source_matches integer;
BEGIN
  IF NEW.materialization_batch_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO batch_row
  FROM hr_legacy_archive_materialization_batch
  WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.materialization_batch_id
  FOR SHARE;
  IF NOT FOUND OR batch_row.status<>'unpublished' THEN
    RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_BATCH_NOT_OPEN';
  END IF;
  IF TG_TABLE_NAME='hr_legacy_identity_registry' THEN
    SELECT count(*)::integer INTO source_matches FROM (
      SELECT 1 FROM hr_legacy_t5_record source
       WHERE source.import_batch_id=batch_row.source_t5_import_batch_id
         AND source.source_table=NEW.source_table
         AND source.source_identity_sha256=NEW.source_identity_sha256
         AND source.source_row_sha256=NEW.source_row_sha256
      UNION ALL
      SELECT 1 FROM hr_legacy_t5_file_evidence source
       WHERE source.import_batch_id=batch_row.source_t5_import_batch_id
         AND source.source_table=NEW.source_table
         AND source.source_identity_sha256=NEW.source_identity_sha256
         AND source.source_row_sha256=NEW.source_row_sha256
    ) source;
    IF source_matches<>1 THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_SOURCE_NOT_EXACT'; END IF;
  ELSE
    IF NOT EXISTS(
      SELECT 1 FROM hr_legacy_identity_registry registry
       WHERE registry.tenant_id=NEW.tenant_id AND registry.park_id=NEW.park_id
         AND registry.id=NEW.identity_registry_id
         AND registry.materialization_batch_id=NEW.materialization_batch_id
    ) THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_BATCH_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_legacy_identity_materialization_source
  BEFORE INSERT OR UPDATE OF tenant_id,park_id,source_table,source_identity_sha256,source_row_sha256,materialization_batch_id
  ON hr_legacy_identity_registry FOR EACH ROW EXECUTE FUNCTION hr_assert_legacy_materialization_source();
CREATE TRIGGER trg_hr_legacy_archive_materialization_source
  BEFORE INSERT OR UPDATE OF tenant_id,park_id,identity_registry_id,materialization_batch_id
  ON hr_legacy_archive_record FOR EACH ROW EXECUTE FUNCTION hr_assert_legacy_materialization_source();
CREATE OR REPLACE FUNCTION hr_guard_legacy_archive_materialization_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_BATCH_IMMUTABLE'; END IF;
  IF ROW(NEW.tenant_id,NEW.park_id,NEW.batch_code,NEW.source_t5_import_batch_id,NEW.projection_kind,NEW.source_snapshot_sha256,NEW.source_manifest_sha256,NEW.source_record_count,NEW.deferred_file_count,NEW.create_time)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.park_id,OLD.batch_code,OLD.source_t5_import_batch_id,OLD.projection_kind,OLD.source_snapshot_sha256,OLD.source_manifest_sha256,OLD.source_record_count,OLD.deferred_file_count,OLD.create_time)
  THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_BATCH_IMMUTABLE'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='unpublished' AND NEW.status='staged') OR
    (OLD.status='staged' AND NEW.status='rolled_back')
  ) THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_TRANSITION_INVALID'; END IF;
  IF OLD.status<>'unpublished' AND NEW.archive_record_count IS DISTINCT FROM OLD.archive_record_count
  THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_COUNTS_IMMUTABLE'; END IF;
  IF OLD.status='rolled_back' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_MATERIALIZATION_BATCH_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_legacy_archive_materialization_batch_guard
  BEFORE UPDATE OR DELETE ON hr_legacy_archive_materialization_batch
  FOR EACH ROW EXECUTE FUNCTION hr_guard_legacy_archive_materialization_batch();

-- Preserve the 000279 immutable contract. A delete is allowed only while the
-- one-time rollback role is inside the SECURITY DEFINER rollback procedure,
-- on an isolated lab database, and for the exact staged materialization batch.
CREATE OR REPLACE FUNCTION hr_t5a_controlled_rollback_matches(
  p_tenant_id varchar,
  p_park_id varchar,
  p_materialization_batch_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT session_user~'^yuzhou_t5a_rollback_[0-9a-f]{16}$'
    AND current_database()~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'
    AND current_setting('jinhu.t5a_rollback_batch_id',true)=p_materialization_batch_id::text
    AND EXISTS(
      SELECT 1 FROM hr_legacy_archive_materialization_batch batch
      WHERE batch.tenant_id=p_tenant_id AND batch.park_id=p_park_id
        AND batch.id=p_materialization_batch_id AND batch.status='staged'
    )
$$;
REVOKE ALL ON FUNCTION hr_t5a_controlled_rollback_matches(varchar,varchar,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION hr_guard_legacy_identity_registry() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.materialization_batch_id IS NOT NULL
      AND hr_t5a_controlled_rollback_matches(OLD.tenant_id,OLD.park_id,OLD.materialization_batch_id)
    THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'HR_LEGACY_IDENTITY_IMMUTABLE';
  END IF;
  IF ROW(OLD.tenant_id,OLD.park_id,OLD.source_system,OLD.source_table,OLD.source_identity_sha256,OLD.source_row_sha256,OLD.identity_kind,OLD.create_time)
    IS DISTINCT FROM ROW(NEW.tenant_id,NEW.park_id,NEW.source_system,NEW.source_table,NEW.source_identity_sha256,NEW.source_row_sha256,NEW.identity_kind,NEW.create_time)
  THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_IMMUTABLE'; END IF;
  IF NEW.mapping_status<>OLD.mapping_status AND NOT (
    NEW.mapping_status='resolved' AND OLD.mapping_status IN ('mapped','archive_only','quarantine')
  ) THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_TRANSITION_INVALID'; END IF;
  IF OLD.mapping_status IN ('mapped','resolved') AND ROW(OLD.owner_employee_id,OLD.owner_record_map_id,OLD.owner_source_system,OLD.owner_source_table,OLD.owner_source_identity_sha256)
    IS DISTINCT FROM ROW(NEW.owner_employee_id,NEW.owner_record_map_id,NEW.owner_source_system,NEW.owner_source_table,NEW.owner_source_identity_sha256)
  THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_OWNER_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION hr_legacy_archive_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' AND TG_TABLE_NAME='hr_legacy_archive_record'
    AND OLD.materialization_batch_id IS NOT NULL
    AND hr_t5a_controlled_rollback_matches(OLD.tenant_id,OLD.park_id,OLD.materialization_batch_id)
  THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_IMMUTABLE';
END $$;

CREATE OR REPLACE PROCEDURE materialize_yuzhou_t5_archive_visibility(
  p_tenant_id varchar,
  p_park_id varchar,
  p_source_t5_import_batch_id uuid,
  p_batch_code varchar,
  p_expected_database varchar
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE source_batch public.hr_legacy_t5_import_batch%ROWTYPE;
DECLARE source_control_batch public.migration_batch%ROWTYPE;
DECLARE materialization_id uuid;
DECLARE source_count bigint;
DECLARE deferred_file_count bigint;
DECLARE archive_count bigint;
DECLARE affected_rows bigint;
BEGIN
  IF session_user!~'^yuzhou_t5a_apply_[0-9a-f]{16}$' THEN RAISE EXCEPTION 'T5A materialization requires dedicated one-time apply role'; END IF;
  IF current_database()<>p_expected_database OR current_database()!~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN
    RAISE EXCEPTION 'Unsafe T5A materialization target';
  END IF;
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'T5A materialization requires SERIALIZABLE';
  END IF;
  LOCK TABLE public.hr_legacy_t5_import_batch,public.hr_legacy_t5_record,public.hr_legacy_t5_file_evidence,
    public.legacy_record_map,public.hr_legacy_identity_registry,public.hr_legacy_archive_record,
    public.hr_legacy_file_logical_record IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO source_batch FROM public.hr_legacy_t5_import_batch
   WHERE tenant_id=p_tenant_id AND park_id=p_park_id AND id=p_source_t5_import_batch_id
     AND status='staged' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified staged T5 source batch not found'; END IF;
  SELECT control.* INTO source_control_batch
  FROM public.migration_batch control
  WHERE control.id=source_batch.migration_batch_id AND control.status='succeeded'
    AND control.target_database=current_database() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Succeeded T5 migration control batch not found'; END IF;
  SELECT count(*) INTO source_count FROM public.hr_legacy_t5_record WHERE import_batch_id=source_batch.id;
  SELECT count(*) INTO deferred_file_count FROM public.hr_legacy_t5_file_evidence WHERE import_batch_id=source_batch.id;
  IF source_count+deferred_file_count<>source_batch.loaded_row_count THEN RAISE EXCEPTION 'T5A source count differs from staged T5 batch'; END IF;
  IF EXISTS(
    SELECT 1 FROM (
      SELECT employee_id FROM public.hr_legacy_t5_record WHERE import_batch_id=source_batch.id AND employee_id IS NOT NULL
    ) source
    WHERE (SELECT count(*) FROM public.legacy_record_map owner
      WHERE owner.source_system='yuzhou-v10' AND owner.source_table='dbo.person'
        AND owner.target_table='hr_employee' AND owner.target_id=source.employee_id
        AND owner.mapping_status IN ('loaded','verified') AND owner.is_active)<>1
  ) THEN RAISE EXCEPTION 'T5A owner requires one exact active T0 record map'; END IF;
  IF EXISTS(
    SELECT 1 FROM (
      SELECT source_table,source_identity_sha256 FROM public.hr_legacy_t5_record WHERE import_batch_id=source_batch.id
    ) source JOIN public.hr_legacy_identity_registry existing
      ON existing.tenant_id=source_batch.tenant_id AND existing.park_id=source_batch.park_id
     AND existing.source_system='yuzhou-v10' AND existing.source_table=source.source_table
     AND existing.source_identity_sha256=source.source_identity_sha256
  ) THEN RAISE EXCEPTION 'T5A source identity already materialized'; END IF;

  INSERT INTO public.hr_legacy_archive_materialization_batch(
    tenant_id,park_id,batch_code,source_t5_import_batch_id,projection_kind,source_snapshot_sha256,
    source_manifest_sha256,source_record_count,deferred_file_count,status
  ) VALUES(
    source_batch.tenant_id,source_batch.park_id,p_batch_code,source_batch.id,'archive_records',
    source_batch.source_snapshot_sha256,source_batch.manifest_sha256,source_count,deferred_file_count,'unpublished'
  ) RETURNING id INTO materialization_id;

  INSERT INTO public.hr_legacy_identity_registry(
    tenant_id,park_id,source_system,source_table,source_identity_sha256,source_row_sha256,
    identity_kind,mapping_status,owner_employee_id,owner_record_map_id,owner_source_system,
    owner_source_table,owner_source_identity_sha256,materialization_batch_id
  )
  SELECT source_batch.tenant_id,source_batch.park_id,'yuzhou-v10',source.source_table,
    source.source_identity_sha256,source.source_row_sha256,source.identity_kind,
    CASE WHEN source.employee_id IS NULL THEN 'archive_only' ELSE 'mapped' END,
    source.employee_id,owner.id,owner.source_system,owner.source_table,owner.source_identity_sha256,materialization_id
  FROM (
    SELECT source_table,source_identity_sha256,source_row_sha256,employee_id,'archive_record'::varchar identity_kind
      FROM public.hr_legacy_t5_record WHERE import_batch_id=source_batch.id
  ) source
  LEFT JOIN LATERAL(
    SELECT map.id,map.source_system,map.source_table,map.source_identity_sha256
    FROM public.legacy_record_map map
    WHERE source.employee_id IS NOT NULL AND map.source_system='yuzhou-v10' AND map.source_table='dbo.person'
      AND map.target_table='hr_employee' AND map.target_id=source.employee_id
      AND map.mapping_status IN ('loaded','verified') AND map.is_active
  ) owner ON true;

  INSERT INTO public.hr_legacy_archive_record(
    tenant_id,park_id,identity_registry_id,record_type,occurred_on,display_title,
    display_safe_projection,restricted_safe_projection,materialization_batch_id
  )
  SELECT source_batch.tenant_id,source_batch.park_id,registry.id,
    CASE source.source_table
      WHEN 'dbo.person.core_residue' THEN 'employee_profile'
      WHEN 'dbo.family' THEN 'family_member'
      WHEN 'dbo.knowhow' THEN 'skill'
      WHEN 'dbo.ticket' THEN 'credential'
      WHEN 'dbo.person_user_item.core_residue' THEN 'employee_profile_field_definition'
      WHEN 'dbo.readjust.core_residue' THEN 'employment_change'
      WHEN 'dbo.readjustitem.core_residue' THEN 'employment_change_type'
      WHEN 'dbo.jobstatecode.core_residue' THEN 'employment_status_dictionary'
      WHEN 'dbo.compact.core_residue' THEN 'labor_contract'
      WHEN 'dbo.compact_c.core_residue' THEN 'labor_contract_change'
      WHEN 'dbo.compacttypecode.core_residue' THEN 'labor_contract_type'
      WHEN 'dbo.trainhis' THEN 'training_history'
      WHEN 'dbo.bonuscode' THEN 'reward_category'
      ELSE 'legacy_history'
    END,
    NULL,
    CASE source.source_table
      WHEN 'dbo.person.core_residue' THEN '旧系统员工资料'
      WHEN 'dbo.family' THEN '家庭成员资料'
      WHEN 'dbo.knowhow' THEN '专业技能资料'
      WHEN 'dbo.ticket' THEN '证书证照资料'
      WHEN 'dbo.readjust.core_residue' THEN '人事异动原始资料'
      WHEN 'dbo.compact.core_residue' THEN '劳动合同原始资料'
      WHEN 'dbo.compact_c.core_residue' THEN '合同变更原始资料'
      WHEN 'dbo.trainhis' THEN '培训历史资料'
      WHEN 'dbo.bonuscode' THEN '奖惩类别资料'
      ELSE '旧系统历史资料'
    END,
    jsonb_strip_nulls(jsonb_build_object(
      'legacyDomain',source.domain,
      'isHistorical',true,
      'skillName',skill.skill_name,
      'credentialName',credential.credential_name,
      'credentialValidTo',credential.valid_to
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'familyRelationship',family.relationship,
      'familyWorkUnit',family.work_unit,
      'familyJobTitle',family.job_title,
      'profileEducation',profile.highest_education,
      'profileMajor',profile.major,
      'profileDegree',profile.degree,
      'profileJobTitle',profile.job_title,
      'profileJobGrade',profile.job_grade,
      'credentialType',credential.credential_type,
      'credentialIssuer',credential.issuing_authority
    )),
    materialization_id
  FROM public.hr_legacy_t5_record source
  JOIN public.hr_legacy_identity_registry registry
    ON registry.tenant_id=source_batch.tenant_id AND registry.park_id=source_batch.park_id
   AND registry.source_system='yuzhou-v10' AND registry.source_table=source.source_table
   AND registry.source_identity_sha256=source.source_identity_sha256
   AND registry.materialization_batch_id=materialization_id
  LEFT JOIN public.hr_employee_profile profile
    ON profile.tenant_id=source_batch.tenant_id AND profile.park_id=source_batch.park_id
   AND profile.legacy_source_identity_sha256=source.source_identity_sha256
   AND profile.legacy_source_row_sha256=source.source_row_sha256 AND NOT profile.is_deleted
  LEFT JOIN public.hr_employee_family family
    ON family.tenant_id=source_batch.tenant_id AND family.park_id=source_batch.park_id
   AND family.legacy_source_identity_sha256=source.source_identity_sha256
   AND family.legacy_source_row_sha256=source.source_row_sha256 AND NOT family.is_deleted
  LEFT JOIN public.hr_employee_skill skill
    ON skill.tenant_id=source_batch.tenant_id AND skill.park_id=source_batch.park_id
   AND skill.legacy_source_identity_sha256=source.source_identity_sha256
   AND skill.legacy_source_row_sha256=source.source_row_sha256 AND NOT skill.is_deleted
  LEFT JOIN public.hr_employee_credential credential
    ON credential.tenant_id=source_batch.tenant_id AND credential.park_id=source_batch.park_id
   AND credential.legacy_source_identity_sha256=source.source_identity_sha256
   AND credential.legacy_source_row_sha256=source.source_row_sha256 AND NOT credential.is_deleted
  WHERE source.import_batch_id=source_batch.id;

  SELECT count(*) INTO archive_count FROM public.hr_legacy_archive_record WHERE materialization_batch_id=materialization_id;
  UPDATE public.hr_legacy_archive_materialization_batch
    SET archive_record_count=archive_count,status='staged',update_time=now()
    WHERE id=materialization_id AND status='unpublished';
  GET DIAGNOSTICS affected_rows=ROW_COUNT;
  IF affected_rows<>1 OR archive_count<>source_count THEN RAISE EXCEPTION 'T5A materialization conservation failed'; END IF;
END $$;
REVOKE ALL ON PROCEDURE materialize_yuzhou_t5_archive_visibility(varchar,varchar,uuid,varchar,varchar) FROM PUBLIC;

CREATE OR REPLACE PROCEDURE rollback_yuzhou_t5_archive_visibility(
  p_tenant_id varchar,
  p_park_id varchar,
  p_materialization_batch_id uuid,
  p_expected_database varchar
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE materialization public.hr_legacy_archive_materialization_batch%ROWTYPE;
DECLARE expected_count bigint;
DECLARE present_count bigint;
DECLARE affected_rows bigint;
BEGIN
  IF session_user!~'^yuzhou_t5a_rollback_[0-9a-f]{16}$' THEN RAISE EXCEPTION 'T5A rollback requires dedicated one-time rollback role'; END IF;
  IF current_database()<>p_expected_database OR current_database()!~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN
    RAISE EXCEPTION 'Unsafe T5A rollback target';
  END IF;
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'T5A rollback requires SERIALIZABLE';
  END IF;
  LOCK TABLE public.hr_legacy_archive_materialization_batch,public.hr_legacy_identity_registry,
    public.hr_legacy_archive_record IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO materialization FROM public.hr_legacy_archive_materialization_batch
    WHERE tenant_id=p_tenant_id AND park_id=p_park_id AND id=p_materialization_batch_id
      AND status='staged' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged T5A materialization batch not found'; END IF;
  expected_count:=materialization.source_record_count+materialization.archive_record_count;
  SELECT (SELECT count(*) FROM public.hr_legacy_identity_registry WHERE materialization_batch_id=materialization.id)
       + (SELECT count(*) FROM public.hr_legacy_archive_record WHERE materialization_batch_id=materialization.id)
    INTO present_count;
  IF present_count<>expected_count THEN RAISE EXCEPTION 'T5A rollback target drift'; END IF;

  PERFORM set_config('jinhu.t5a_rollback_batch_id',materialization.id::text,true);
  DELETE FROM public.hr_legacy_archive_record WHERE materialization_batch_id=materialization.id;
  GET DIAGNOSTICS affected_rows=ROW_COUNT;
  IF affected_rows<>materialization.archive_record_count THEN RAISE EXCEPTION 'T5A rollback archive count drift'; END IF;
  DELETE FROM public.hr_legacy_identity_registry WHERE materialization_batch_id=materialization.id;
  GET DIAGNOSTICS affected_rows=ROW_COUNT;
  IF affected_rows<>materialization.source_record_count THEN RAISE EXCEPTION 'T5A rollback identity count drift'; END IF;
  PERFORM set_config('jinhu.t5a_rollback_batch_id','',true);
  UPDATE public.hr_legacy_archive_materialization_batch SET status='rolled_back',update_time=now()
    WHERE id=materialization.id AND status='staged';
  GET DIAGNOSTICS affected_rows=ROW_COUNT;
  IF affected_rows<>1 THEN RAISE EXCEPTION 'T5A rollback receipt update failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.hr_legacy_identity_registry WHERE materialization_batch_id=materialization.id)
     OR EXISTS(SELECT 1 FROM public.hr_legacy_archive_record WHERE materialization_batch_id=materialization.id)
  THEN RAISE EXCEPTION 'T5A rollback residual is nonzero'; END IF;
END $$;
REVOKE ALL ON PROCEDURE rollback_yuzhou_t5_archive_visibility(varchar,varchar,uuid,varchar) FROM PUBLIC;

COMMIT;
