-- Forward-only correction: bs_ass_compute stores the complete weighted sum
-- plus cent-precision adjustments once in numeric(18,2). Rounding the subtotal
-- first changes signed half cases across zero. Preserve all source facts,
-- the rounded subtotal API, function identity and existing privileges.
-- Frozen source SQL SHA256: 33c9eb04c04c01a360e5d8987c10fa35c733fe566093803e340e7cd3971ae414

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
    SELECT (
      sum(COALESCE(result.source_self_value,0)) * COALESCE(template.source_s_percent,0) / 100::numeric
    + sum(COALESCE(result.source_m_item_value,0))::numeric(18,0) * COALESCE(template.source_m_percent,0) / 100::numeric
    + sum(COALESCE(result.source_item_value,0)) * COALESCE(template.source_t_percent,0) / 100::numeric
    + sum(COALESCE(result.source_x_item_value,0))::numeric(18,0) * COALESCE(template.source_x_percent,0) / 100::numeric
    + sum(COALESCE(result.source_c_item_value,0))::numeric(18,0) * COALESCE(template.source_c_percent,0) / 100::numeric
    ) AS value
    FROM hr_performance_legacy_template_profile template
    JOIN hr_performance_legacy_dimension_profile dimension
      ON (dimension.tenant_id,dimension.park_id,dimension.migration_batch_id,dimension.legacy_template_profile_id)=
         (template.tenant_id,template.park_id,template.migration_batch_id,template.id)
    JOIN hr_performance_legacy_dimension_result result
      ON (result.tenant_id,result.park_id,result.migration_batch_id,result.legacy_dimension_profile_id)=
         (dimension.tenant_id,dimension.park_id,dimension.migration_batch_id,dimension.id)
    WHERE (template.tenant_id,template.park_id,template.migration_batch_id,template.id)=
          (master.tenant_id,master.park_id,master.migration_batch_id,master.legacy_template_profile_id)
      AND result.source_session_id IS NOT DISTINCT FROM master.source_session_id
      AND result.source_person_code IS NOT DISTINCT FROM master.source_person_code
    GROUP BY template.source_s_percent,template.source_m_percent,template.source_t_percent,
             template.source_x_percent,template.source_c_percent
  ) subtotal
  WHERE master.id=p_master_id
$$;

COMMENT ON FUNCTION hr_performance_yuzhou_legacy_full_total(uuid) IS
  'Replays bs_ass_compute by rounding the raw five weighted aggregates plus adjustments once; source facts remain immutable.';
