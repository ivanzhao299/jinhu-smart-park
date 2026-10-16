-- Pure v1 snapshot mathematics. No source facts, relationships or roles are changed.
BEGIN;

CREATE FUNCTION hr_performance_five_channel_snapshot_total_v1(
  p_weights jsonb, p_details jsonb, p_adjustments jsonb
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  weight_keys constant text[] := ARRAY['sPercent','mPercent','tPercent','xPercent','cPercent'];
  value_keys constant text[] := ARRAY['selfValue','mItemValue','itemValue','xItemValue','cItemValue'];
  adjustment_keys constant text[] := ARRAY['masterValue','timekeepValue','bonusValue'];
  weights numeric[] := ARRAY[0,0,0,0,0]::numeric[];
  sums numeric[] := ARRAY[0,0,0,0,0]::numeric[];
  adjustment numeric := 0;
  row_value jsonb;
  field_value jsonb;
  key_name text;
  i integer;
  parsed numeric;
BEGIN
  IF jsonb_typeof(p_weights) IS DISTINCT FROM 'object'
     OR NOT p_weights ?& weight_keys OR p_weights - weight_keys <> '{}'::jsonb
     OR jsonb_typeof(p_adjustments) IS DISTINCT FROM 'object'
     OR NOT p_adjustments ?& adjustment_keys OR p_adjustments - adjustment_keys <> '{}'::jsonb
     OR jsonb_typeof(p_details) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid channel snapshot shape';
  END IF;
  FOR i IN 1..5 LOOP
    field_value := p_weights -> weight_keys[i];
    IF field_value <> 'null'::jsonb THEN
      IF jsonb_typeof(field_value) <> 'string' OR (field_value #>> '{}') !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid channel weight';
      END IF;
      weights[i] := (field_value #>> '{}')::integer;
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY adjustment_keys LOOP
    field_value := p_adjustments -> key_name;
    IF field_value <> 'null'::jsonb THEN
      IF jsonb_typeof(field_value) <> 'string' OR (field_value #>> '{}') !~ '^-?[0-9]+([.][0-9]{1,2})?$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid channel adjustment';
      END IF;
      adjustment := adjustment + (field_value #>> '{}')::numeric(18,2);
    END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(p_details) LOOP
    IF jsonb_typeof(row_value) IS DISTINCT FROM 'object'
       OR NOT row_value ?& (value_keys || ARRAY['id'])
       OR row_value - (value_keys || ARRAY['id']) <> '{}'::jsonb
       OR jsonb_typeof(row_value -> 'id') IS DISTINCT FROM 'string'
       OR length(row_value ->> 'id') NOT BETWEEN 1 AND 128 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid channel detail';
    END IF;
    FOR i IN 1..5 LOOP
      field_value := row_value -> value_keys[i];
      IF field_value <> 'null'::jsonb THEN
        IF jsonb_typeof(field_value) <> 'string' OR (field_value #>> '{}') !~ '^-?[0-9]+([.][0-9]{1,2})?$' THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid channel detail value';
        END IF;
        parsed := (field_value #>> '{}')::numeric(18,2);
        sums[i] := sums[i] + parsed;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_details) GROUP BY value ->> 'id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate channel detail identity';
  END IF;
  IF jsonb_array_length(p_details)=0 THEN RETURN NULL; END IF;
  -- Cast the COMPLETE M/X/C sums even when the corresponding weight is zero.
  sums[2] := sums[2]::numeric(18,0);
  sums[4] := sums[4]::numeric(18,0);
  sums[5] := sums[5]::numeric(18,0);
  RETURN round(sums[1]*weights[1]/100::numeric + sums[2]*weights[2]/100::numeric
    + sums[3]*weights[3]/100::numeric + sums[4]*weights[4]/100::numeric
    + sums[5]*weights[5]/100::numeric + adjustment,2);
EXCEPTION WHEN numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='Channel snapshot numeric range exceeded';
END
$$;

CREATE FUNCTION hr_performance_threshold_snapshot_grade_v1(p_total numeric,p_levels jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  row_value jsonb;
  field_value jsonb;
  threshold numeric;
  winning_min numeric;
  winning_grade text;
  winning_count bigint := 0;
  result_status text;
BEGIN
  IF jsonb_typeof(p_levels) IS DISTINCT FROM 'array'
     OR (p_total IS NOT NULL AND (p_total::text IN ('NaN','Infinity','-Infinity') OR scale(p_total) > 2)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid grade snapshot shape or total';
  END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(p_levels) LOOP
    IF jsonb_typeof(row_value) IS DISTINCT FROM 'object'
       OR NOT row_value ?& ARRAY['id','grade','minValue']
       OR row_value - ARRAY['id','grade','minValue'] <> '{}'::jsonb
       OR jsonb_typeof(row_value -> 'id') IS DISTINCT FROM 'string'
       OR length(row_value ->> 'id') NOT BETWEEN 1 AND 128
       OR jsonb_typeof(row_value -> 'grade') IS DISTINCT FROM 'string'
       OR length(row_value ->> 'grade') > 64 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid grade candidate';
    END IF;
    field_value := row_value -> 'minValue';
    IF field_value <> 'null'::jsonb THEN
      IF jsonb_typeof(field_value) <> 'string' OR (field_value #>> '{}') !~ '^-?[0-9]+([.][0-9]{1,2})?$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid grade threshold';
      END IF;
      threshold := (field_value #>> '{}')::numeric(18,2);
      IF threshold <= p_total THEN
        IF winning_min IS NULL OR threshold > winning_min THEN
          winning_min := threshold; winning_count := 1; winning_grade := row_value ->> 'grade';
        ELSIF threshold = winning_min THEN
          winning_count := winning_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_levels) GROUP BY value ->> 'id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate grade candidate identity';
  END IF;
  result_status := CASE WHEN p_total IS NULL THEN 'TOTAL_UNAVAILABLE'
    WHEN winning_count=0 THEN 'NO_ELIGIBLE_GRADE'
    WHEN winning_count>1 THEN 'AMBIGUOUS_TOP_THRESHOLD' ELSE 'RESOLVED' END;
  RETURN jsonb_build_object('status',result_status,
    'expectedGrade',CASE WHEN winning_count=1 THEN winning_grade END,
    'winningMinValue',winning_min::text,'winningCandidateCount',winning_count);
EXCEPTION WHEN numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='Grade snapshot numeric range exceeded';
END
$$;

REVOKE ALL ON FUNCTION hr_performance_five_channel_snapshot_total_v1(jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_threshold_snapshot_grade_v1(numeric,jsonb) FROM PUBLIC;
COMMENT ON FUNCTION hr_performance_five_channel_snapshot_total_v1(jsonb,jsonb,jsonb) IS
  'Pure exact five-channel v1 mathematics; complete decimal-string snapshots; no source relationship or business acceptance claim.';
COMMENT ON FUNCTION hr_performance_threshold_snapshot_grade_v1(numeric,jsonb) IS
  'Pure complete-candidate highest-minimum lookup; ties remain ambiguous; RESOLVED is not source parity.';

-- Constant-only golden checks: failure rolls back the entire migration.
DO $check$
DECLARE
  weights jsonb := '{"sPercent":"50","mPercent":"0","tPercent":"0","xPercent":"0","cPercent":"0"}';
  details jsonb := '[{"id":"golden","selfValue":"0.01","mItemValue":null,"itemValue":null,"xItemValue":null,"cItemValue":null}]';
  adjustments jsonb := '{"masterValue":"-0.01","timekeepValue":null,"bonusValue":null}';
BEGIN
  IF public.hr_performance_five_channel_snapshot_total_v1(weights,details,adjustments) IS DISTINCT FROM -0.01
    OR public.hr_performance_five_channel_snapshot_total_v1(weights,
      jsonb_set(details,'{0,selfValue}','"-0.01"'),jsonb_set(adjustments,'{masterValue}','"0.01"')) IS DISTINCT FROM 0.01 THEN
    RAISE EXCEPTION 'Channel snapshot final rounding self-check failed';
  END IF;
  IF public.hr_performance_five_channel_snapshot_total_v1(
    '{"sPercent":null,"mPercent":"100","tPercent":null,"xPercent":null,"cPercent":null}',
    '[{"id":"a","selfValue":null,"mItemValue":"0.40","itemValue":null,"xItemValue":null,"cItemValue":null},
      {"id":"b","selfValue":null,"mItemValue":"0.40","itemValue":null,"xItemValue":null,"cItemValue":null}]',
    '{"masterValue":null,"timekeepValue":null,"bonusValue":null}') IS DISTINCT FROM 1.00 THEN
    RAISE EXCEPTION 'Channel snapshot aggregate rounding self-check failed';
  END IF;
  IF public.hr_performance_threshold_snapshot_grade_v1(70,
    '[{"id":"a","grade":"A","minValue":"70"},{"id":"b","grade":"A","minValue":"70.00"}]')->>'status'
    IS DISTINCT FROM 'AMBIGUOUS_TOP_THRESHOLD' THEN
    RAISE EXCEPTION 'Channel snapshot grade ambiguity self-check failed';
  END IF;
END
$check$;
COMMIT;
