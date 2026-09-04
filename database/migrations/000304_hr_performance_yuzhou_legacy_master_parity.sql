BEGIN;

-- bs_ass_compute assigns the master grade with:
--   TOP 1 assgrade FROM assgradecode WHERE minvalue <= total ORDER BY minvalue DESC
-- It does not filter by assessment and does not inspect maxvalue.  Preserve that
-- observable rule while making same-threshold ambiguity explicit instead of
-- silently choosing a different grade from the legacy database.
CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_grade_parity(p_master_id uuid)
RETURNS TABLE(
  calculated_total numeric,
  source_total numeric,
  expected_ass_grade varchar,
  source_ass_grade varchar,
  winning_min_value integer,
  winning_candidate_count bigint,
  parity_status text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  WITH master AS (
    SELECT fact.*,
           hr_performance_yuzhou_legacy_full_total(fact.id) AS replayed_total
    FROM hr_performance_legacy_master_result fact
    WHERE fact.id=p_master_id
  ), eligible AS (
    SELECT level.source_ass_grade,level.source_min_value,
           max(level.source_min_value) OVER () AS top_min_value
    FROM master
    JOIN hr_performance_legacy_level_rule level
      ON (level.tenant_id,level.park_id,level.migration_batch_id)=
         (master.tenant_id,master.park_id,master.migration_batch_id)
     AND level.source_min_value<=master.replayed_total
  ), winning AS (
    SELECT source_ass_grade,source_min_value
    FROM eligible
    WHERE source_min_value=top_min_value
  ), choice AS (
    SELECT min(source_ass_grade) AS sole_grade,
           min(source_min_value) AS threshold,
           count(*) AS candidate_count
    FROM winning
  )
  SELECT master.replayed_total,
         master.source_total_value,
         CASE WHEN choice.candidate_count=1 THEN choice.sole_grade END,
         master.source_ass_grade,
         choice.threshold,
         choice.candidate_count,
         CASE
           WHEN master.replayed_total IS NULL THEN 'TOTAL_UNAVAILABLE'
           WHEN choice.candidate_count=0 THEN 'NO_ELIGIBLE_GRADE'
           WHEN choice.candidate_count>1 THEN 'AMBIGUOUS_TOP_THRESHOLD'
           WHEN choice.sole_grade IS NOT DISTINCT FROM master.source_ass_grade
             AND master.replayed_total IS NOT DISTINCT FROM master.source_total_value THEN 'MATCH'
           ELSE 'MISMATCH'
         END
  FROM master
  CROSS JOIN choice
$$;

COMMENT ON FUNCTION hr_performance_yuzhou_legacy_grade_parity(uuid) IS
  'Replays bs_ass_compute grade lookup without assessment/maxvalue filtering and reports same-threshold ambiguity explicitly.';

REVOKE ALL ON FUNCTION hr_performance_yuzhou_legacy_grade_parity(uuid) FROM PUBLIC;

COMMIT;
