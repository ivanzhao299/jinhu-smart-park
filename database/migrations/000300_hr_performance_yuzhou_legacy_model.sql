BEGIN;

-- Yuzhou V10 performance carries five score channels and source-specific
-- grading rules that cannot be represented losslessly by the modern
-- self/manager submission model.  Keep the modern workflow authoritative and
-- preserve the legacy facts in a separate, tenant/park-scoped compatibility
-- layer.  The five tables intentionally mirror the five audited source tables;
-- nullable source values remain nullable and are never replaced by invented
-- modern values.

CREATE UNIQUE INDEX uq_hr_perf_version_parent_identity
  ON hr_performance_template_version(id,tenant_id,park_id,template_id);
CREATE UNIQUE INDEX uq_hr_perf_dimension_parent_identity
  ON hr_performance_template_dimension(id,tenant_id,park_id,template_version_id);
CREATE UNIQUE INDEX uq_hr_perf_level_parent_identity
  ON hr_performance_template_level(id,tenant_id,park_id,template_version_id);

CREATE TABLE hr_performance_legacy_template_profile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,

  source_assessment integer NOT NULL,
  source_assessment_name varchar(50),
  source_department varchar(30),
  source_m_percent integer,
  source_t_percent integer,
  source_x_percent integer,
  source_c_percent integer,
  source_s_percent integer,
  source_timekeep boolean,
  source_bonus boolean,
  source_master boolean,

  target_template_id uuid,
  target_template_version_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_perf_legacy_template_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_template_batch_scope UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT uq_hr_perf_legacy_template_source UNIQUE(migration_batch_id,tenant_id,park_id,source_assessment),
  CONSTRAINT uq_hr_perf_legacy_template_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_template_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_template_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_template_target_pair CHECK(
    (target_template_id IS NULL)=(target_template_version_id IS NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_template_target FOREIGN KEY(target_template_id,tenant_id,park_id)
    REFERENCES hr_performance_template(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_template_version FOREIGN KEY(
    target_template_version_id,tenant_id,park_id,target_template_id
  ) REFERENCES hr_performance_template_version(id,tenant_id,park_id,template_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_template_batch
  ON hr_performance_legacy_template_profile(migration_batch_id,tenant_id,park_id);
CREATE INDEX ix_hr_perf_legacy_template_target
  ON hr_performance_legacy_template_profile(tenant_id,park_id,target_template_version_id)
  WHERE target_template_version_id IS NOT NULL;

CREATE TABLE hr_performance_legacy_level_rule (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,

  source_ass_grade varchar(12) NOT NULL,
  source_description varchar(500),
  source_my_order varchar(2),
  source_assessment_id integer,
  source_min_value integer,
  source_max_value integer,

  legacy_template_profile_id uuid,
  target_template_version_id uuid,
  target_level_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_perf_legacy_level_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_level_source UNIQUE(migration_batch_id,tenant_id,park_id,source_ass_grade),
  CONSTRAINT uq_hr_perf_legacy_level_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_level_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_level_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_level_target_pair CHECK(
    (target_template_version_id IS NULL)=(target_level_id IS NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_level_profile FOREIGN KEY(
    legacy_template_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_template_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_level_version FOREIGN KEY(target_template_version_id,tenant_id,park_id)
    REFERENCES hr_performance_template_version(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_level_target FOREIGN KEY(
    target_level_id,tenant_id,park_id,target_template_version_id
  ) REFERENCES hr_performance_template_level(id,tenant_id,park_id,template_version_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_level_profile
  ON hr_performance_legacy_level_rule(tenant_id,park_id,migration_batch_id,legacy_template_profile_id);

CREATE TABLE hr_performance_legacy_dimension_profile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,

  source_item_id integer NOT NULL,
  source_assessment_id integer,
  source_item_name varchar(100),
  source_full_value numeric(18,2),
  source_my_order integer,

  legacy_template_profile_id uuid,
  target_template_version_id uuid,
  target_dimension_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_perf_legacy_dimension_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_dimension_batch_scope UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT uq_hr_perf_legacy_dimension_source UNIQUE(migration_batch_id,tenant_id,park_id,source_item_id),
  CONSTRAINT uq_hr_perf_legacy_dimension_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_dimension_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_dimension_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_dimension_target_pair CHECK(
    (target_template_version_id IS NULL)=(target_dimension_id IS NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_dimension_profile FOREIGN KEY(
    legacy_template_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_template_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_dimension_version FOREIGN KEY(target_template_version_id,tenant_id,park_id)
    REFERENCES hr_performance_template_version(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_dimension_target FOREIGN KEY(
    target_dimension_id,tenant_id,park_id,target_template_version_id
  ) REFERENCES hr_performance_template_dimension(id,tenant_id,park_id,template_version_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_dimension_profile
  ON hr_performance_legacy_dimension_profile(tenant_id,park_id,migration_batch_id,legacy_template_profile_id);

CREATE TABLE hr_performance_legacy_dimension_level_guide (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,

  source_guide_id integer NOT NULL,
  source_item_id integer,
  source_grade varchar(12),
  source_description varchar(500),
  source_min_value integer,
  source_max_value integer,
  source_my_order integer,

  legacy_dimension_profile_id uuid,
  target_template_version_id uuid,
  target_dimension_id uuid,
  target_level_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_perf_legacy_guide_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_guide_source UNIQUE(migration_batch_id,tenant_id,park_id,source_guide_id),
  CONSTRAINT uq_hr_perf_legacy_guide_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_guide_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_guide_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_guide_target_shape CHECK(
    (target_template_version_id IS NULL AND target_dimension_id IS NULL AND target_level_id IS NULL)
    OR (target_template_version_id IS NOT NULL AND target_dimension_id IS NOT NULL AND target_level_id IS NOT NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_guide_profile FOREIGN KEY(
    legacy_dimension_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_dimension_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_guide_dimension FOREIGN KEY(
    target_dimension_id,tenant_id,park_id,target_template_version_id
  ) REFERENCES hr_performance_template_dimension(id,tenant_id,park_id,template_version_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_guide_level FOREIGN KEY(
    target_level_id,tenant_id,park_id,target_template_version_id
  ) REFERENCES hr_performance_template_level(id,tenant_id,park_id,template_version_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_guide_profile
  ON hr_performance_legacy_dimension_level_guide(tenant_id,park_id,migration_batch_id,legacy_dimension_profile_id);

CREATE TABLE hr_performance_legacy_dimension_result (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,

  source_detail_id integer NOT NULL,
  source_session_id integer,
  source_person_code varchar(10),
  source_item_id integer,
  source_self_value numeric(18,2),
  source_m_item_value numeric(18,2),
  source_item_value numeric(18,2),
  source_x_item_value numeric(18,2),
  source_c_item_value numeric(18,2),
  source_self_grade varchar(12),
  source_ass_grade varchar(12),
  source_appraisal varchar(200),

  legacy_dimension_profile_id uuid,
  target_cycle_employee_id uuid,
  target_template_version_id uuid,
  target_dimension_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_perf_legacy_result_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_result_source UNIQUE(migration_batch_id,tenant_id,park_id,source_detail_id),
  CONSTRAINT uq_hr_perf_legacy_result_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_result_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_result_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_result_target_dimension CHECK(
    (target_template_version_id IS NULL)=(target_dimension_id IS NULL)
  ),
  CONSTRAINT fk_hr_perf_legacy_result_profile FOREIGN KEY(
    legacy_dimension_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_dimension_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_result_employee FOREIGN KEY(target_cycle_employee_id,tenant_id,park_id)
    REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_result_dimension FOREIGN KEY(
    target_dimension_id,tenant_id,park_id,target_template_version_id
  ) REFERENCES hr_performance_template_dimension(id,tenant_id,park_id,template_version_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_result_lookup
  ON hr_performance_legacy_dimension_result(
    tenant_id,park_id,migration_batch_id,source_session_id,source_person_code
  );
CREATE INDEX ix_hr_perf_legacy_result_profile
  ON hr_performance_legacy_dimension_result(tenant_id,park_id,migration_batch_id,legacy_dimension_profile_id);
CREATE INDEX ix_hr_perf_legacy_result_employee
  ON hr_performance_legacy_dimension_result(tenant_id,park_id,target_cycle_employee_id)
  WHERE target_cycle_employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_fact_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_batch_id uuid:=COALESCE(NEW.migration_batch_id,OLD.migration_batch_id);
  v_rollback_batch text:=current_setting('yuzhou.performance_legacy_rollback_batch_id',true);
BEGIN
  IF TG_OP='DELETE'
     AND v_rollback_batch=v_batch_id::text
     AND EXISTS(
       SELECT 1 FROM migration_batch batch
       WHERE batch.id=v_batch_id
         AND batch.target_database=current_database()
         AND batch.phase='rollback'
         AND batch.status='running'
     ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_FACT_APPEND_ONLY' USING ERRCODE='55000';
END$$;

CREATE TRIGGER trg_hr_perf_legacy_template_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_template_profile
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();
CREATE TRIGGER trg_hr_perf_legacy_level_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_level_rule
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();
CREATE TRIGGER trg_hr_perf_legacy_dimension_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_dimension_profile
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();
CREATE TRIGGER trg_hr_perf_legacy_guide_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_dimension_level_guide
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();
CREATE TRIGGER trg_hr_perf_legacy_result_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_dimension_result
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_assert_record_map(p_map_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_fact record;
  v_map legacy_record_map%ROWTYPE;
BEGIN
  SELECT fact.*,count(*) OVER() AS fact_count INTO v_fact FROM (
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.assessmentcode'::varchar AS source_table,
           'hr_performance_legacy_template_profile'::varchar AS target_table
      FROM hr_performance_legacy_template_profile WHERE legacy_record_map_id=p_map_id
    UNION ALL
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.assgradecode','hr_performance_legacy_level_rule'
      FROM hr_performance_legacy_level_rule WHERE legacy_record_map_id=p_map_id
    UNION ALL
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.assitem','hr_performance_legacy_dimension_profile'
      FROM hr_performance_legacy_dimension_profile WHERE legacy_record_map_id=p_map_id
    UNION ALL
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.assitemgradedes','hr_performance_legacy_dimension_level_guide'
      FROM hr_performance_legacy_dimension_level_guide WHERE legacy_record_map_id=p_map_id
    UNION ALL
    SELECT legacy_record_map_id,migration_batch_id,id,source_identity_sha256,source_row_sha256,
           'dbo.assessmentdetail','hr_performance_legacy_dimension_result'
      FROM hr_performance_legacy_dimension_result WHERE legacy_record_map_id=p_map_id
  ) fact;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_fact.fact_count<>1 THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RECORD_MAP_COLLISION';
  END IF;

  SELECT * INTO v_map FROM legacy_record_map WHERE id=p_map_id FOR SHARE;
  IF NOT FOUND
     OR v_map.batch_id<>v_fact.migration_batch_id
     OR v_map.source_system<>'yuzhou-v10'
     OR v_map.source_table<>v_fact.source_table
     OR v_map.source_identity_sha256<>v_fact.source_identity_sha256
     OR v_map.source_row_sha256<>v_fact.source_row_sha256
     OR v_map.target_table<>v_fact.target_table
     OR v_map.target_id<>v_fact.id
     OR v_map.mapping_status NOT IN('loaded','verified')
     OR NOT v_map.is_active THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_RECORD_MAP_MISMATCH';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_validate_record_map_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM hr_performance_yuzhou_assert_record_map(OLD.legacy_record_map_id);
  END IF;
  IF TG_OP<>'DELETE' THEN
    PERFORM hr_performance_yuzhou_assert_record_map(NEW.legacy_record_map_id);
  END IF;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_validate_record_map_reverse_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM hr_performance_yuzhou_assert_record_map(COALESCE(NEW.id,OLD.id));
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_template_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_template_profile
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_record_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_level_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_level_rule
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_record_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_dimension_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_dimension_profile
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_record_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_guide_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_dimension_level_guide
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_record_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_result_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_dimension_result
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_record_map_trigger();
CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_map_reverse_exact
  AFTER INSERT OR UPDATE OR DELETE ON legacy_record_map
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_record_map_reverse_trigger();

-- This is deliberately the weighted detail subtotal only.  The complete old
-- total also includes assessmentmaster.mastervalue/timekeepvalue/bonusvalue;
-- those fields belong to the next relationship slice and must not be invented.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_weighted_detail_total(
  p_tenant_id varchar,
  p_park_id varchar,
  p_migration_batch_id uuid,
  p_legacy_template_profile_id uuid,
  p_source_session_id integer,
  p_source_person_code varchar
) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT round(
      COALESCE(sum(result.source_self_value),0) * COALESCE(template.source_s_percent,0) / 100::numeric
    + COALESCE(sum(result.source_m_item_value),0) * COALESCE(template.source_m_percent,0) / 100::numeric
    + COALESCE(sum(result.source_item_value),0) * COALESCE(template.source_t_percent,0) / 100::numeric
    + COALESCE(sum(result.source_x_item_value),0) * COALESCE(template.source_x_percent,0) / 100::numeric
    + COALESCE(sum(result.source_c_item_value),0) * COALESCE(template.source_c_percent,0) / 100::numeric,
    2
  )
  FROM hr_performance_legacy_template_profile template
  JOIN hr_performance_legacy_dimension_profile dimension
    ON (dimension.tenant_id,dimension.park_id,dimension.migration_batch_id,dimension.legacy_template_profile_id)=
       (template.tenant_id,template.park_id,template.migration_batch_id,template.id)
  JOIN hr_performance_legacy_dimension_result result
    ON (result.tenant_id,result.park_id,result.migration_batch_id,result.legacy_dimension_profile_id)=
       (dimension.tenant_id,dimension.park_id,dimension.migration_batch_id,dimension.id)
  WHERE (template.tenant_id,template.park_id,template.migration_batch_id,template.id)=
        (p_tenant_id,p_park_id,p_migration_batch_id,p_legacy_template_profile_id)
    AND result.source_session_id IS NOT DISTINCT FROM p_source_session_id
    AND result.source_person_code IS NOT DISTINCT FROM p_source_person_code
  GROUP BY template.source_s_percent,template.source_m_percent,template.source_t_percent,
           template.source_x_percent,template.source_c_percent
$$;

COMMENT ON FUNCTION hr_performance_yuzhou_weighted_detail_total(varchar,varchar,uuid,uuid,integer,varchar) IS
  'Recomputes only the five-channel Yuzhou detail subtotal; master/timekeeping/bonus additions are intentionally excluded until their source relationship is materialized.';

REVOKE ALL ON hr_performance_legacy_template_profile FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_level_rule FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_dimension_profile FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_dimension_level_guide FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_dimension_result FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_legacy_fact_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_assert_record_map(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_validate_record_map_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_validate_record_map_reverse_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_weighted_detail_total(varchar,varchar,uuid,uuid,integer,varchar) FROM PUBLIC;

COMMIT;
