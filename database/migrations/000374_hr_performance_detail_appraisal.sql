BEGIN;

-- Optional per-detail narrative. Preserve exact old JSON, function OIDs and ACL.
-- Required detail text uses the ECMAScript trim whitespace set only for blank detection; stored text is never trimmed.
-- Text cells are excluded from score completeness; core370 arithmetic is unchanged.
CREATE OR REPLACE FUNCTION hr_performance_channel_workflow_valid(p jsonb,d jsonb,publish boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE x jsonb;k text;v jsonb;seen text[]:=ARRAY[]::text[];actor text;extended boolean:=p ? 'detailAppraisalPolicy';fields text[]:=ARRAY['s','m','t','x','c','master','timekeep','bonus','selfAppraisal','appraisal','description','salaryReference'];
BEGIN
 IF extended THEN fields:=array_append(fields,'detailAppraisal');END IF;
 IF NOT public.hr_performance_channel_object_v1(p,ARRAY['schemaVersion','detailDefinitions','masterPolicies','appealReviewAllowed']||CASE WHEN extended THEN ARRAY['detailAppraisalPolicy'] ELSE ARRAY[]::text[] END) OR p->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'detailDefinitions') IS DISTINCT FROM 'array' OR NOT public.hr_performance_channel_config_valid_v1(d) THEN RETURN false;END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'detailDefinitions') LOOP
  IF NOT public.hr_performance_channel_object_v1(x,ARRAY['id','itemId']) OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR char_length(x->>'id') NOT BETWEEN 1 AND 128 OR x->>'id'=ANY(seen) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') a WHERE a->'id'=x->'itemId') THEN RETURN false;END IF;seen:=array_append(seen,x->>'id');
 END LOOP;
 IF NOT public.hr_performance_channel_object_v1(p->'masterPolicies',ARRAY['selfAppraisal','appraisal','description','salaryReference']) OR NOT public.hr_performance_channel_object_v1(p->'appealReviewAllowed',fields) THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_each(p->'appealReviewAllowed') LOOP IF NOT public.hr_performance_channel_scalar_v1(v,'bool') OR (publish AND v='null'::jsonb) THEN RETURN false;END IF;END LOOP;
 FOR k,v IN SELECT key,value FROM jsonb_each(p->'masterPolicies') UNION ALL SELECT 'detailAppraisal',p->'detailAppraisalPolicy' WHERE extended LOOP
  IF NOT public.hr_performance_channel_object_v1(v,ARRAY['stage','allowedActors','required','allowExplicitNull']) OR NOT public.hr_performance_channel_policy_v1(v||'{"businessName":null}'::jsonb,false) THEN RETURN false;END IF;
 END LOOP;
 IF publish THEN
  IF cardinality(seen)=0 OR jsonb_array_length(d->'items')=0 OR jsonb_array_length(d->'gradeCandidates')=0 THEN RETURN false;END IF;
  FOR v IN SELECT value FROM jsonb_each(d->'channels') UNION ALL SELECT value FROM jsonb_each(d->'adjustmentPolicy') UNION ALL SELECT value FROM jsonb_each(p->'masterPolicies') UNION ALL SELECT p->'detailAppraisalPolicy' WHERE extended LOOP
   actor:=CASE v->>'stage' WHEN 'self_review' THEN 'self' WHEN 'manager_review' THEN 'manager' WHEN 'calibration' THEN 'calibrator' END;
   IF actor IS NULL OR NOT v->'allowedActors' ? actor OR jsonb_typeof(v->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(v->'allowExplicitNull') IS DISTINCT FROM 'boolean' OR (v->'required'='true'::jsonb AND v->'allowExplicitNull'='true'::jsonb) THEN RETURN false;END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_each(d->'adjustmentPolicy') a WHERE a.value->>'inputMode' IS DISTINCT FROM 'manual_with_evidence') THEN RETURN false;END IF;
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION hr_performance_channel_policy_for(d jsonb,w jsonb,f text) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT CASE WHEN f IN('s','m','t','x','c') THEN d->'channels'->f WHEN f IN('master','timekeep','bonus') THEN d->'adjustmentPolicy'->f WHEN f='detailAppraisal' THEN w->'detailAppraisalPolicy' ELSE w->'masterPolicies'->f END $$;
CREATE OR REPLACE FUNCTION hr_performance_channel_cells(i jsonb) RETURNS TABLE(detail_id text,field text,cell jsonb) LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT a->>'id',c.key,c.value FROM jsonb_array_elements(i->'details') a CROSS JOIN LATERAL jsonb_each(a->'channels') c UNION ALL SELECT a->>'id','detailAppraisal',a->'appraisal' FROM jsonb_array_elements(i->'details') a WHERE a ? 'appraisal' UNION ALL SELECT NULL,c.key,c.value FROM jsonb_each(i->'adjustments') c UNION ALL SELECT NULL,c.key,c.value FROM jsonb_each(i->'master') c
$$;
CREATE OR REPLACE FUNCTION hr_performance_channel_input_valid(i jsonb,w jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r record;v jsonb;ids text[]:=ARRAY[]::text[];t text;
BEGIN
 IF NOT public.hr_performance_channel_object_v1(i,ARRAY['schemaVersion','details','adjustments','master']) OR i->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(i->'details') IS DISTINCT FROM 'array' OR NOT public.hr_performance_channel_object_v1(i->'adjustments',ARRAY['master','timekeep','bonus']) OR NOT public.hr_performance_channel_object_v1(i->'master',ARRAY['selfAppraisal','appraisal','description','salaryReference']) THEN RETURN false;END IF;
 IF jsonb_array_length(i->'details')<>jsonb_array_length(w->'detailDefinitions') THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(i->'details') LOOP
  IF NOT public.hr_performance_channel_object_v1(v,ARRAY['id','itemId','channels']||CASE WHEN w ? 'detailAppraisalPolicy' THEN ARRAY['appraisal'] ELSE ARRAY[]::text[] END) OR NOT public.hr_performance_channel_object_v1(v->'channels',ARRAY['s','m','t','x','c']) OR v->>'id'=ANY(ids) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'detailDefinitions') def WHERE def->'id'=v->'id' AND def->'itemId'=v->'itemId') THEN RETURN false;END IF;ids:=array_append(ids,v->>'id');
 END LOOP;
 FOR r IN SELECT * FROM public.hr_performance_channel_cells(i) LOOP
  v:=r.cell;IF NOT public.hr_performance_channel_object_v1(v,ARRAY['state','value','actorUserId','changedAt','evidence']) OR v->>'state' NOT IN('UNPROVIDED','EXPLICIT_NULL','VALUE') OR jsonb_typeof(v->'state')<>'string' THEN RETURN false;END IF;
  IF v->>'state'='UNPROVIDED' THEN IF v IS DISTINCT FROM '{"state":"UNPROVIDED","value":null,"actorUserId":null,"changedAt":null,"evidence":null}'::jsonb THEN RETURN false;END IF;
  ELSE
   IF jsonb_typeof(v->'actorUserId') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'changedAt') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'evidence') IS DISTINCT FROM 'string' OR char_length(v->>'evidence') NOT BETWEEN 2 AND 1000 OR v->>'evidence' !~ '[^[:space:]]' THEN RETURN false;END IF;
   IF v->>'state'='EXPLICIT_NULL' THEN IF v->'value' IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
   ELSIF r.field IN('selfAppraisal','appraisal','description','detailAppraisal') THEN IF jsonb_typeof(v->'value') IS DISTINCT FROM 'string' OR char_length(v->>'value')>(CASE WHEN r.field='detailAppraisal' THEN 200 ELSE 500 END) OR (r.field='detailAppraisal' AND w->'detailAppraisalPolicy'->'required'='true'::jsonb AND btrim(v->>'value',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='') THEN RETURN false;END IF;
   ELSIF r.field='salaryReference' THEN t:=v->>'value';IF jsonb_typeof(v->'value') IS DISTINCT FROM 'string' OR t !~ '^-?[0-9]+([.][0-9]{1,4})?$' OR length(ltrim(split_part(ltrim(t,'-'),'.',1),'0'))>15 THEN RETURN false;END IF;
   ELSE IF v->'value'='null'::jsonb OR NOT public.hr_performance_channel_scalar_v1(v->'value','decimal') THEN RETURN false;END IF;
   END IF;
  END IF;
 END LOOP;RETURN true;
END $$;
CREATE OR REPLACE FUNCTION hr_performance_channel_calculate(t jsonb,i jsonb,rid uuid) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE d jsonb;tally numeric;g jsonb;candidate jsonb;complete boolean;
BEGIN
 IF NOT public.hr_performance_channel_input_valid(i,t->'channelWorkflow') THEN RAISE EXCEPTION 'invalid channel input';END IF;
 SELECT NOT EXISTS(SELECT 1 FROM public.hr_performance_channel_cells(i) WHERE field NOT IN('selfAppraisal','appraisal','description','salaryReference','detailAppraisal') AND cell->>'state'='UNPROVIDED') INTO complete;
 IF complete THEN
  SELECT jsonb_agg(jsonb_build_object('id',a->'id','selfValue',a->'channels'->'s'->'value','mItemValue',a->'channels'->'m'->'value','itemValue',a->'channels'->'t'->'value','xItemValue',a->'channels'->'x'->'value','cItemValue',a->'channels'->'c'->'value') ORDER BY ord) INTO d FROM jsonb_array_elements(i->'details') WITH ORDINALITY x(a,ord);
  tally:=public.hr_performance_five_channel_snapshot_total_v1(t->'channelDefinition'->'weights',COALESCE(d,'[]'::jsonb),jsonb_build_object('masterValue',i->'adjustments'->'master'->'value','timekeepValue',i->'adjustments'->'timekeep'->'value','bonusValue',i->'adjustments'->'bonus'->'value'));
 END IF;
 SELECT public.hr_performance_threshold_snapshot_grade_v1(tally,COALESCE(jsonb_agg(jsonb_build_object('id',a->'id','grade',a->'code','minValue',a->'minValue')),'[]'::jsonb)) INTO g FROM jsonb_array_elements(t->'channelDefinition'->'gradeCandidates') a;
 IF g->>'status'='RESOLVED' THEN SELECT a INTO candidate FROM jsonb_array_elements(t->'channelDefinition'->'gradeCandidates') a WHERE (a->>'minValue')::numeric=(g->>'winningMinValue')::numeric;END IF;
 RETURN jsonb_build_object('schemaVersion',1,'mathVersion','five_channel_v1','inputRevisionId',rid,'complete',complete,'score',tally::text,'grade',g,'gradeCandidate',candidate,'levelCode',candidate->>'code','levelName',candidate->>'code');
END $$;
CREATE OR REPLACE FUNCTION hr_performance_channel_stage_complete(t jsonb,i jsonb,stage text) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.hr_performance_channel_cells(i) c CROSS JOIN LATERAL(SELECT public.hr_performance_channel_policy_for(t->'channelDefinition',t->'channelWorkflow',c.field) p) x WHERE p->>'stage'=stage AND ((c.field NOT IN('selfAppraisal','appraisal','description','salaryReference','detailAppraisal') AND c.cell->>'state'='UNPROVIDED') OR (p->'required'='true'::jsonb AND(c.cell->>'state'<>'VALUE' OR(c.field IN('selfAppraisal','appraisal','description','detailAppraisal') AND (CASE WHEN c.field='detailAppraisal' THEN btrim(c.cell->>'value',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' ELSE c.cell->>'value' !~ '[^[:space:]]' END)))) OR (c.cell->>'state'='EXPLICIT_NULL' AND p->'allowExplicitNull'<>'true'::jsonb)))
$$;
COMMIT;
