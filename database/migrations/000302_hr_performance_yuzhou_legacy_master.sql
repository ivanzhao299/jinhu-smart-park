BEGIN;

-- assessmentmaster is the employee/session summary written by bs_AssCreateRecord
-- and recomputed by bs_ass_compute.  It is not equivalent to the modern result
-- row: the old procedure first stores three component sums as numeric(18,0),
-- applies five independent template percentages, then adds three adjustments.
-- Preserve all 21 source columns before projecting any modern workflow state.

CREATE TABLE hr_performance_legacy_master_result (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map(id) DEFERRABLE INITIALLY DEFERRED,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,

  source_master_id integer NOT NULL,
  source_session_id integer,
  source_person_code varchar(10),
  source_self_grade varchar(12),
  source_ass_grade varchar(12),
  source_self_value numeric(18,2),
  source_item_value numeric(18,2),
  source_m_item_value numeric(18,0),
  source_x_item_value numeric(18,0),
  source_c_item_value numeric(18,0),
  source_master_value numeric(18,2),
  source_timekeep_value numeric(18,2),
  source_bonus_value numeric(18,2),
  source_total_value numeric(18,2),
  source_self_appraisal varchar(500),
  source_appraisal varchar(500),
  source_pay numeric(19,4),
  source_assessment_person varchar(50),
  source_recorded_at timestamp without time zone,
  source_operator_code varchar(10),
  source_description varchar(500),

  legacy_template_profile_id uuid,
  target_cycle_employee_id uuid,
  target_template_version_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_perf_legacy_master_scope UNIQUE(id,tenant_id,park_id),
  CONSTRAINT uq_hr_perf_legacy_master_source UNIQUE(
    migration_batch_id,tenant_id,park_id,source_master_id
  ),
  CONSTRAINT uq_hr_perf_legacy_master_map UNIQUE(legacy_record_map_id),
  CONSTRAINT ck_hr_perf_legacy_master_identity CHECK(source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_perf_legacy_master_row CHECK(source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT fk_hr_perf_legacy_master_profile FOREIGN KEY(
    legacy_template_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_template_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_master_employee FOREIGN KEY(
    target_cycle_employee_id,tenant_id,park_id
  ) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_legacy_master_version FOREIGN KEY(
    target_template_version_id,tenant_id,park_id
  ) REFERENCES hr_performance_template_version(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_hr_perf_legacy_master_lookup
  ON hr_performance_legacy_master_result(
    tenant_id,park_id,migration_batch_id,source_session_id,source_person_code
  );
CREATE INDEX ix_hr_perf_legacy_master_employee
  ON hr_performance_legacy_master_result(tenant_id,park_id,target_cycle_employee_id)
  WHERE target_cycle_employee_id IS NOT NULL;

CREATE TRIGGER trg_hr_perf_legacy_master_immutable
  BEFORE UPDATE OR DELETE ON hr_performance_legacy_master_result
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_assert_master_record_map(p_map_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_fact hr_performance_legacy_master_result%ROWTYPE;
  v_map legacy_record_map%ROWTYPE;
BEGIN
  SELECT * INTO v_fact FROM hr_performance_legacy_master_result
  WHERE legacy_record_map_id=p_map_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_map FROM legacy_record_map WHERE id=p_map_id FOR SHARE;
  IF NOT FOUND
     OR v_map.batch_id<>v_fact.migration_batch_id
     OR v_map.source_system<>'yuzhou-v10'
     OR v_map.source_table<>'dbo.assessmentmaster'
     OR v_map.source_identity_sha256<>v_fact.source_identity_sha256
     OR v_map.source_row_sha256<>v_fact.source_row_sha256
     OR v_map.target_table<>'hr_performance_legacy_master_result'
     OR v_map.target_id<>v_fact.id
     OR v_map.mapping_status NOT IN('loaded','verified')
     OR NOT v_map.is_active THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_LEGACY_MASTER_RECORD_MAP_MISMATCH';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_validate_master_record_map_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM hr_performance_yuzhou_assert_master_record_map(OLD.legacy_record_map_id);
  END IF;
  IF TG_OP<>'DELETE' THEN
    PERFORM hr_performance_yuzhou_assert_master_record_map(NEW.legacy_record_map_id);
  END IF;
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_validate_master_record_map_reverse_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM hr_performance_yuzhou_assert_master_record_map(COALESCE(NEW.id,OLD.id));
  RETURN COALESCE(NEW,OLD);
END$$;

CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_master_map_exact
  AFTER INSERT OR UPDATE OR DELETE ON hr_performance_legacy_master_result
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_master_record_map_trigger();

CREATE CONSTRAINT TRIGGER trg_hr_perf_legacy_master_map_reverse_exact
  AFTER INSERT OR UPDATE OR DELETE ON legacy_record_map
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION hr_performance_yuzhou_validate_master_record_map_reverse_trigger();

-- SQL Server stores M/X/C aggregates in numeric(18,0) assessmentmaster columns
-- before applying the percentages.  The casts below reproduce that observable
-- bs_ass_compute behavior instead of calculating directly from decimal details.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_weighted_detail_total(
  p_tenant_id varchar,
  p_park_id varchar,
  p_migration_batch_id uuid,
  p_legacy_template_profile_id uuid,
  p_source_session_id integer,
  p_source_person_code varchar
) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT round(
      sum(COALESCE(result.source_self_value,0)) * COALESCE(template.source_s_percent,0) / 100::numeric
    + sum(COALESCE(result.source_m_item_value,0))::numeric(18,0) * COALESCE(template.source_m_percent,0) / 100::numeric
    + sum(COALESCE(result.source_item_value,0)) * COALESCE(template.source_t_percent,0) / 100::numeric
    + sum(COALESCE(result.source_x_item_value,0))::numeric(18,0) * COALESCE(template.source_x_percent,0) / 100::numeric
    + sum(COALESCE(result.source_c_item_value,0))::numeric(18,0) * COALESCE(template.source_c_percent,0) / 100::numeric,
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

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_full_total(p_master_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN subtotal.value IS NULL THEN NULL ELSE round(
    subtotal.value
      + COALESCE(master.source_master_value,0)
      + COALESCE(master.source_timekeep_value,0)
      + COALESCE(master.source_bonus_value,0),
    2
  ) END
  FROM hr_performance_legacy_master_result master
  CROSS JOIN LATERAL (
    SELECT hr_performance_yuzhou_weighted_detail_total(
      master.tenant_id,master.park_id,master.migration_batch_id,
      master.legacy_template_profile_id,master.source_session_id,master.source_person_code
    ) value
  ) subtotal
  WHERE master.id=p_master_id
$$;

COMMENT ON FUNCTION hr_performance_yuzhou_legacy_full_total(uuid) IS
  'Replays bs_ass_compute total: five weighted detail aggregates plus master, timekeeping and bonus adjustments; source_total_value remains the comparison baseline.';

REVOKE ALL ON hr_performance_legacy_master_result FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_assert_master_record_map(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_validate_master_record_map_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_validate_master_record_map_reverse_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_legacy_full_total(uuid) FROM PUBLIC;

COMMIT;
