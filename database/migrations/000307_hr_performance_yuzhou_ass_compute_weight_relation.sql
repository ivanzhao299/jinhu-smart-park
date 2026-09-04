BEGIN;

-- bs_ass_compute obtains weights through assessmentmaster.person ->
-- person.assessment -> assessmentcode.  Keep that source relationship beside
-- the existing detail-derived template relation without changing either fact.
CREATE TABLE hr_performance_legacy_person_assessment_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  source_person_identity_sha256 char(64) NOT NULL,
  source_assessment_id integer,
  evidence_sha256 char(64) NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_person_assessment_evidence_scope
    UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT uq_hr_perf_person_assessment_evidence_value
    UNIQUE(migration_batch_id,tenant_id,park_id,source_person_identity_sha256,evidence_sha256),
  CONSTRAINT ck_hr_perf_person_assessment_evidence_hash CHECK(
    source_person_identity_sha256~'^[0-9a-f]{64}$'
    AND evidence_sha256~'^[0-9a-f]{64}$'
  )
);

CREATE TABLE hr_performance_legacy_ass_compute_weight_resolution (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_master_result_id uuid NOT NULL,
  source_person_identity_sha256 char(64),
  source_person_evidence_count integer NOT NULL,
  source_person_assessment_id integer,
  person_template_candidate_count integer NOT NULL,
  person_template_profile_id uuid,
  person_resolution_status varchar(40) NOT NULL,
  detail_template_candidate_count integer NOT NULL,
  detail_template_profile_id uuid,
  detail_resolution_status varchar(24) NOT NULL,
  comparison_status varchar(24) NOT NULL,
  evidence_sha256 char(64) NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_perf_ass_compute_resolution_scope
    UNIQUE(id,tenant_id,park_id,migration_batch_id),
  CONSTRAINT uq_hr_perf_ass_compute_resolution_master UNIQUE(legacy_master_result_id),
  CONSTRAINT ck_hr_perf_ass_compute_resolution_counts CHECK(
    source_person_evidence_count>=0
    AND person_template_candidate_count>=0
    AND detail_template_candidate_count>=0
  ),
  CONSTRAINT ck_hr_perf_ass_compute_resolution_hashes CHECK(
    (source_person_identity_sha256 IS NULL OR source_person_identity_sha256~'^[0-9a-f]{64}$')
    AND evidence_sha256~'^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_perf_ass_compute_person_status CHECK(
    person_resolution_status IN(
      'not_applicable','evidence_unmatched','evidence_ambiguous',
      'assessment_missing','template_unmatched','template_ambiguous','resolved'
    )
  ),
  CONSTRAINT ck_hr_perf_ass_compute_person_target CHECK(
    (person_resolution_status='not_applicable'
      AND source_person_identity_sha256 IS NULL
      AND source_person_evidence_count=0 AND source_person_assessment_id IS NULL
      AND person_template_candidate_count=0 AND person_template_profile_id IS NULL)
    OR (person_resolution_status='evidence_unmatched'
      AND source_person_identity_sha256 IS NOT NULL
      AND source_person_evidence_count=0 AND source_person_assessment_id IS NULL
      AND person_template_candidate_count=0 AND person_template_profile_id IS NULL)
    OR (person_resolution_status='evidence_ambiguous'
      AND source_person_identity_sha256 IS NOT NULL
      AND source_person_evidence_count>1 AND source_person_assessment_id IS NULL
      AND person_template_candidate_count=0 AND person_template_profile_id IS NULL)
    OR (person_resolution_status='assessment_missing'
      AND source_person_identity_sha256 IS NOT NULL
      AND source_person_evidence_count=1 AND source_person_assessment_id IS NULL
      AND person_template_candidate_count=0 AND person_template_profile_id IS NULL)
    OR (person_resolution_status='template_unmatched'
      AND source_person_identity_sha256 IS NOT NULL
      AND source_person_evidence_count=1 AND source_person_assessment_id IS NOT NULL
      AND person_template_candidate_count=0 AND person_template_profile_id IS NULL)
    OR (person_resolution_status='template_ambiguous'
      AND source_person_identity_sha256 IS NOT NULL
      AND source_person_evidence_count=1 AND source_person_assessment_id IS NOT NULL
      AND person_template_candidate_count>1 AND person_template_profile_id IS NULL)
    OR (person_resolution_status='resolved'
      AND source_person_identity_sha256 IS NOT NULL
      AND source_person_evidence_count=1 AND source_person_assessment_id IS NOT NULL
      AND person_template_candidate_count=1 AND person_template_profile_id IS NOT NULL)
  ),
  CONSTRAINT ck_hr_perf_ass_compute_detail_status CHECK(
    (detail_resolution_status='unmatched'
      AND detail_template_candidate_count=0 AND detail_template_profile_id IS NULL)
    OR (detail_resolution_status='ambiguous'
      AND detail_template_candidate_count>1 AND detail_template_profile_id IS NULL)
    OR (detail_resolution_status='resolved'
      AND detail_template_candidate_count=1 AND detail_template_profile_id IS NOT NULL)
  ),
  CONSTRAINT ck_hr_perf_ass_compute_comparison CHECK(
    comparison_status IN('matched','mismatch','not_comparable')
    AND ((comparison_status IN('matched','mismatch')
        AND person_resolution_status='resolved' AND detail_resolution_status='resolved')
      OR (comparison_status='not_comparable'
        AND (person_resolution_status<>'resolved' OR detail_resolution_status<>'resolved')))
    AND (comparison_status<>'matched' OR person_template_profile_id=detail_template_profile_id)
    AND (comparison_status<>'mismatch' OR person_template_profile_id<>detail_template_profile_id)
  ),
  CONSTRAINT fk_hr_perf_ass_compute_resolution_master FOREIGN KEY(
    legacy_master_result_id,tenant_id,park_id
  ) REFERENCES hr_performance_legacy_master_result(id,tenant_id,park_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_ass_compute_resolution_person_profile FOREIGN KEY(
    person_template_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_template_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_hr_perf_ass_compute_resolution_detail_profile FOREIGN KEY(
    detail_template_profile_id,tenant_id,park_id,migration_batch_id
  ) REFERENCES hr_performance_legacy_template_profile(id,tenant_id,park_id,migration_batch_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX ix_hr_perf_ass_compute_resolution_status
  ON hr_performance_legacy_ass_compute_weight_resolution(
    tenant_id,park_id,migration_batch_id,person_resolution_status,
    detail_resolution_status,comparison_status
  );

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_person_assessment_evidence_sha256(
  p_source_person_identity_sha256 char(64),p_source_assessment_id integer
) RETURNS char(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  SELECT encode(digest(convert_to(jsonb_build_object(
    'contract','yuzhou-performance-person-assessment-v1',
    'sourcePersonIdentitySha256',p_source_person_identity_sha256,
    'sourceAssessmentId',p_source_assessment_id
  )::text,'UTF8'),'sha256'),'hex')::char(64)
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_ass_compute_weight_evidence_sha256(
  p_master_id uuid,p_source_person_identity_sha256 char(64),
  p_source_person_evidence_count integer,p_source_person_assessment_id integer,
  p_person_template_candidate_count integer,p_person_template_profile_id uuid,
  p_person_resolution_status varchar,p_detail_template_candidate_count integer,
  p_detail_template_profile_id uuid,p_detail_resolution_status varchar,
  p_comparison_status varchar
) RETURNS char(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  SELECT encode(digest(convert_to(jsonb_build_object(
    'contract','yuzhou-performance-ass-compute-weight-resolution-v1',
    'masterId',p_master_id,
    'sourcePersonIdentitySha256',p_source_person_identity_sha256,
    'sourcePersonEvidenceCount',p_source_person_evidence_count,
    'sourcePersonAssessmentId',p_source_person_assessment_id,
    'personTemplateCandidateCount',p_person_template_candidate_count,
    'personTemplateProfileId',p_person_template_profile_id,
    'personResolutionStatus',p_person_resolution_status,
    'detailTemplateCandidateCount',p_detail_template_candidate_count,
    'detailTemplateProfileId',p_detail_template_profile_id,
    'detailResolutionStatus',p_detail_resolution_status,
    'comparisonStatus',p_comparison_status
  )::text,'UTF8'),'sha256'),'hex')::char(64)
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_ass_compute_weight_expectation(p_master_id uuid)
RETURNS TABLE(
  source_person_identity_sha256 char(64),
  source_person_evidence_count integer,
  source_person_assessment_id integer,
  person_template_candidate_count integer,
  person_template_profile_id uuid,
  person_resolution_status varchar,
  detail_template_candidate_count integer,
  detail_template_profile_id uuid,
  detail_resolution_status varchar,
  comparison_status varchar
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  WITH master_fact AS (
    SELECT master.*,
      hr_performance_yuzhou_person_identity_sha256(master.source_person_code) person_identity
    FROM hr_performance_legacy_master_result master WHERE master.id=p_master_id
  ),
  person_evidence AS (
    SELECT master_fact.*,
      stats.evidence_count,
      CASE WHEN stats.evidence_count=1 THEN stats.assessment_id END assessment_id
    FROM master_fact
    CROSS JOIN LATERAL (
      SELECT count(evidence.id)::integer evidence_count,
        min(evidence.source_assessment_id) assessment_id
      FROM hr_performance_legacy_person_assessment_evidence evidence
      WHERE (evidence.tenant_id,evidence.park_id,evidence.migration_batch_id)=
            (master_fact.tenant_id,master_fact.park_id,master_fact.migration_batch_id)
        AND evidence.source_person_identity_sha256=master_fact.person_identity
    ) stats
  ),
  person_template AS (
    SELECT person_evidence.*,
      stats.candidate_count,
      CASE WHEN stats.candidate_count=1 THEN stats.profile_id END person_profile_id
    FROM person_evidence
    CROSS JOIN LATERAL (
      SELECT count(profile.id)::integer candidate_count,
        min(profile.id::text)::uuid profile_id
      FROM hr_performance_legacy_template_profile profile
      WHERE person_evidence.evidence_count=1
        AND person_evidence.assessment_id IS NOT NULL
        AND (profile.tenant_id,profile.park_id,profile.migration_batch_id,
             profile.source_assessment)=
            (person_evidence.tenant_id,person_evidence.park_id,
             person_evidence.migration_batch_id,person_evidence.assessment_id)
    ) stats
  ),
  detail_template AS (
    SELECT person_template.*,
      stats.candidate_count detail_candidate_count,
      CASE WHEN stats.candidate_count=1 THEN stats.profile_id END detail_profile_id
    FROM person_template
    CROSS JOIN LATERAL (
      SELECT count(candidate.profile_id)::integer candidate_count,
        min(candidate.profile_id::text)::uuid profile_id
      FROM (
        SELECT DISTINCT dimension.legacy_template_profile_id profile_id
        FROM hr_performance_legacy_dimension_result result
        JOIN hr_performance_legacy_dimension_profile dimension
          ON (dimension.id,dimension.tenant_id,dimension.park_id,dimension.migration_batch_id)=
             (result.legacy_dimension_profile_id,result.tenant_id,result.park_id,result.migration_batch_id)
        WHERE (result.tenant_id,result.park_id,result.migration_batch_id)=
              (person_template.tenant_id,person_template.park_id,person_template.migration_batch_id)
          AND result.source_session_id IS NOT DISTINCT FROM person_template.source_session_id
          AND result.source_person_code IS NOT DISTINCT FROM person_template.source_person_code
          AND dimension.legacy_template_profile_id IS NOT NULL
      ) candidate
    ) stats
  ),
  classified AS (
    SELECT detail_template.*,
      CASE
        WHEN person_identity IS NULL THEN 'not_applicable'
        WHEN evidence_count=0 THEN 'evidence_unmatched'
        WHEN evidence_count>1 THEN 'evidence_ambiguous'
        WHEN assessment_id IS NULL THEN 'assessment_missing'
        WHEN candidate_count=0 THEN 'template_unmatched'
        WHEN candidate_count>1 THEN 'template_ambiguous'
        ELSE 'resolved'
      END::varchar person_status,
      CASE
        WHEN detail_candidate_count=0 THEN 'unmatched'
        WHEN detail_candidate_count>1 THEN 'ambiguous'
        ELSE 'resolved'
      END::varchar detail_status
    FROM detail_template
  )
  SELECT person_identity,evidence_count,assessment_id,candidate_count,person_profile_id,
    person_status,detail_candidate_count,detail_profile_id,detail_status,
    CASE
      WHEN person_status<>'resolved' OR detail_status<>'resolved' THEN 'not_comparable'
      WHEN person_profile_id=detail_profile_id THEN 'matched'
      ELSE 'mismatch'
    END::varchar comparison_status
  FROM classified
$$;

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_person_assessment_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_batch migration_batch%ROWTYPE;
BEGIN
  IF TG_OP='DELETE'
    AND current_setting('yuzhou.ass_compute_weight_rollback_batch_id',true)=OLD.migration_batch_id::text
    AND EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=OLD.migration_batch_id
      AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback'
      AND batch.status='running') THEN
    RETURN OLD;
  END IF;
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_EVIDENCE_IMMUTABLE';
  END IF;
  SELECT * INTO v_batch FROM migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.execution_context<>'lab_rehearsal'
    OR v_batch.target_database<>current_database()
    OR v_batch.phase<>'load' OR v_batch.status<>'running' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_BATCH_INVALID';
  END IF;
  IF NEW.evidence_sha256<>hr_performance_yuzhou_person_assessment_evidence_sha256(
      NEW.source_person_identity_sha256,NEW.source_assessment_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_PERSON_ASSESSMENT_EVIDENCE_HASH_MISMATCH';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_perf_person_assessment_evidence_exact
  BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_legacy_person_assessment_evidence
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_person_assessment_evidence_guard();

CREATE OR REPLACE FUNCTION hr_performance_yuzhou_ass_compute_weight_resolution_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_batch migration_batch%ROWTYPE;
  v_master hr_performance_legacy_master_result%ROWTYPE;
  v_expected record;
  v_expected_evidence char(64);
BEGIN
  IF TG_OP='DELETE'
    AND current_setting('yuzhou.ass_compute_weight_rollback_batch_id',true)=OLD.migration_batch_id::text
    AND EXISTS(SELECT 1 FROM migration_batch batch WHERE batch.id=OLD.migration_batch_id
      AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback'
      AND batch.status='running') THEN
    RETURN OLD;
  END IF;
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_IMMUTABLE';
  END IF;
  SELECT * INTO v_batch FROM migration_batch WHERE id=NEW.migration_batch_id FOR SHARE;
  IF NOT FOUND OR v_batch.execution_context<>'lab_rehearsal'
    OR v_batch.target_database<>current_database()
    OR v_batch.phase<>'load' OR v_batch.status<>'running' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_BATCH_INVALID';
  END IF;
  SELECT * INTO v_master FROM hr_performance_legacy_master_result
  WHERE (id,tenant_id,park_id,migration_batch_id)=
    (NEW.legacy_master_result_id,NEW.tenant_id,NEW.park_id,NEW.migration_batch_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_MASTER_MISMATCH';
  END IF;
  SELECT * INTO STRICT v_expected
  FROM hr_performance_yuzhou_ass_compute_weight_expectation(NEW.legacy_master_result_id);
  IF v_master.legacy_template_profile_id IS DISTINCT FROM v_expected.detail_template_profile_id THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_DETAIL_DERIVATION_DRIFT';
  END IF;
  IF ROW(
      NEW.source_person_identity_sha256,NEW.source_person_evidence_count,
      NEW.source_person_assessment_id,NEW.person_template_candidate_count,
      NEW.person_template_profile_id,NEW.person_resolution_status,
      NEW.detail_template_candidate_count,NEW.detail_template_profile_id,
      NEW.detail_resolution_status,NEW.comparison_status
    ) IS DISTINCT FROM ROW(
      v_expected.source_person_identity_sha256,v_expected.source_person_evidence_count,
      v_expected.source_person_assessment_id,v_expected.person_template_candidate_count,
      v_expected.person_template_profile_id,v_expected.person_resolution_status,
      v_expected.detail_template_candidate_count,v_expected.detail_template_profile_id,
      v_expected.detail_resolution_status,v_expected.comparison_status
    ) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_MISMATCH';
  END IF;
  v_expected_evidence:=hr_performance_yuzhou_ass_compute_weight_evidence_sha256(
    NEW.legacy_master_result_id,NEW.source_person_identity_sha256,
    NEW.source_person_evidence_count,NEW.source_person_assessment_id,
    NEW.person_template_candidate_count,NEW.person_template_profile_id,
    NEW.person_resolution_status,NEW.detail_template_candidate_count,
    NEW.detail_template_profile_id,NEW.detail_resolution_status,NEW.comparison_status
  );
  IF NEW.evidence_sha256<>v_expected_evidence THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_EVIDENCE_HASH_MISMATCH';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_perf_ass_compute_weight_resolution_exact
  BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_legacy_ass_compute_weight_resolution
  FOR EACH ROW EXECUTE FUNCTION hr_performance_yuzhou_ass_compute_weight_resolution_guard();

CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_lab(
  p_tenant_id varchar,p_park_id varchar,p_batch_id uuid,p_payload jsonb
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_row jsonb;
  v_evidence_id uuid;
  v_evidence_hash char(64);
  v_assessment_id integer;
  v_master record;
  v_expected record;
  v_resolution_id uuid;
  v_resolution_hash char(64);
  v_expected_count integer;
  v_namespace constant uuid:='be9df574-adbd-4bbf-8da1-1875ba647055';
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch WHERE batch.id=p_batch_id
    AND batch.source_system='yuzhou-v10' AND batch.target_database=current_database()
    AND batch.execution_context='lab_rehearsal' AND batch.phase='load'
    AND batch.status='running' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_BATCH_INVALID'; END IF;
  IF btrim(COALESCE(p_tenant_id,''))='' OR btrim(COALESCE(p_park_id,''))='' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_SCOPE_INVALID';
  END IF;
  IF NOT hr_performance_yuzhou_jsonb_exact_keys(p_payload,ARRAY['personAssessments'])
    OR jsonb_typeof(p_payload->'personAssessments')<>'array' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_PAYLOAD_INVALID';
  END IF;

  LOCK TABLE hr_performance_legacy_person_assessment_evidence,
    hr_performance_legacy_ass_compute_weight_resolution,
    hr_performance_legacy_master_result,hr_performance_legacy_template_profile,
    hr_performance_legacy_dimension_profile,hr_performance_legacy_dimension_result
    IN SHARE ROW EXCLUSIVE MODE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'personAssessments') LOOP
    IF NOT hr_performance_yuzhou_jsonb_exact_keys(
        v_row,ARRAY['sourcePersonIdentitySha256','sourceAssessmentId'])
      OR (v_row->>'sourcePersonIdentitySha256')!~'^[0-9a-f]{64}$'
      OR (jsonb_typeof(v_row->'sourceAssessmentId') NOT IN('number','null')) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_PERSON_EVIDENCE_INVALID';
    END IF;
    v_assessment_id:=NULLIF(v_row->>'sourceAssessmentId','')::integer;
    v_evidence_hash:=hr_performance_yuzhou_person_assessment_evidence_sha256(
      (v_row->>'sourcePersonIdentitySha256')::char(64),v_assessment_id
    );
    v_evidence_id:=uuid_generate_v5(
      v_namespace,'person-assessment:'||p_batch_id::text||':'
        ||(v_row->>'sourcePersonIdentitySha256')||':'||COALESCE(v_assessment_id::text,'<null>')
    );
    INSERT INTO hr_performance_legacy_person_assessment_evidence(
      id,tenant_id,park_id,migration_batch_id,source_person_identity_sha256,
      source_assessment_id,evidence_sha256
    ) VALUES(
      v_evidence_id,p_tenant_id,p_park_id,p_batch_id,
      v_row->>'sourcePersonIdentitySha256',v_assessment_id,v_evidence_hash
    ) ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_person_assessment_evidence evidence
      WHERE (evidence.id,evidence.tenant_id,evidence.park_id,evidence.migration_batch_id)=
            (v_evidence_id,p_tenant_id,p_park_id,p_batch_id)
        AND evidence.source_person_identity_sha256=v_row->>'sourcePersonIdentitySha256'
        AND evidence.source_assessment_id IS NOT DISTINCT FROM v_assessment_id
        AND evidence.evidence_sha256=v_evidence_hash) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REPLAY_DRIFT';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM hr_performance_legacy_person_assessment_evidence
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))
      <>jsonb_array_length(p_payload->'personAssessments') THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_PERSON_EVIDENCE_CONSERVATION_FAILED';
  END IF;

  FOR v_master IN SELECT id FROM hr_performance_legacy_master_result
    WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id)
    ORDER BY id
  LOOP
    SELECT * INTO STRICT v_expected
    FROM hr_performance_yuzhou_ass_compute_weight_expectation(v_master.id);
    v_resolution_id:=uuid_generate_v5(
      v_namespace,'master-weight:'||p_batch_id::text||':'||v_master.id::text
    );
    v_resolution_hash:=hr_performance_yuzhou_ass_compute_weight_evidence_sha256(
      v_master.id,v_expected.source_person_identity_sha256,
      v_expected.source_person_evidence_count,v_expected.source_person_assessment_id,
      v_expected.person_template_candidate_count,v_expected.person_template_profile_id,
      v_expected.person_resolution_status,v_expected.detail_template_candidate_count,
      v_expected.detail_template_profile_id,v_expected.detail_resolution_status,
      v_expected.comparison_status
    );
    INSERT INTO hr_performance_legacy_ass_compute_weight_resolution(
      id,tenant_id,park_id,migration_batch_id,legacy_master_result_id,
      source_person_identity_sha256,source_person_evidence_count,
      source_person_assessment_id,person_template_candidate_count,
      person_template_profile_id,person_resolution_status,
      detail_template_candidate_count,detail_template_profile_id,
      detail_resolution_status,comparison_status,evidence_sha256
    ) VALUES(
      v_resolution_id,p_tenant_id,p_park_id,p_batch_id,v_master.id,
      v_expected.source_person_identity_sha256,v_expected.source_person_evidence_count,
      v_expected.source_person_assessment_id,v_expected.person_template_candidate_count,
      v_expected.person_template_profile_id,v_expected.person_resolution_status,
      v_expected.detail_template_candidate_count,v_expected.detail_template_profile_id,
      v_expected.detail_resolution_status,v_expected.comparison_status,v_resolution_hash
    ) ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_ass_compute_weight_resolution resolution
      WHERE resolution.id=v_resolution_id
        AND ROW(
          resolution.source_person_identity_sha256,resolution.source_person_evidence_count,
          resolution.source_person_assessment_id,resolution.person_template_candidate_count,
          resolution.person_template_profile_id,resolution.person_resolution_status,
          resolution.detail_template_candidate_count,resolution.detail_template_profile_id,
          resolution.detail_resolution_status,resolution.comparison_status,resolution.evidence_sha256
        ) IS NOT DISTINCT FROM ROW(
          v_expected.source_person_identity_sha256,v_expected.source_person_evidence_count,
          v_expected.source_person_assessment_id,v_expected.person_template_candidate_count,
          v_expected.person_template_profile_id,v_expected.person_resolution_status,
          v_expected.detail_template_candidate_count,v_expected.detail_template_profile_id,
          v_expected.detail_resolution_status,v_expected.comparison_status,v_resolution_hash
        )) THEN
      RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REPLAY_DRIFT';
    END IF;
  END LOOP;
  SELECT count(*) INTO v_expected_count FROM hr_performance_legacy_master_result
  WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id);
  IF (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE (tenant_id,park_id,migration_batch_id)=(p_tenant_id,p_park_id,p_batch_id))
      <>v_expected_count THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_CONSERVATION_FAILED';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

CREATE OR REPLACE PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_lab(
  p_batch_id uuid
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_ROLLBACK_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM 1 FROM migration_batch batch WHERE batch.id=p_batch_id
    AND batch.target_database=current_database()
    AND batch.execution_context='lab_rehearsal' AND batch.phase='rollback'
    AND batch.status='running' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_ROLLBACK_BATCH_INVALID'; END IF;
  PERFORM set_config('yuzhou.ass_compute_weight_rollback_batch_id',p_batch_id::text,true);
  DELETE FROM hr_performance_legacy_ass_compute_weight_resolution
    WHERE migration_batch_id=p_batch_id;
  DELETE FROM hr_performance_legacy_person_assessment_evidence
    WHERE migration_batch_id=p_batch_id;
  IF EXISTS(SELECT 1 FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE migration_batch_id=p_batch_id)
    OR EXISTS(SELECT 1 FROM hr_performance_legacy_person_assessment_evidence
      WHERE migration_batch_id=p_batch_id) THEN
    RAISE EXCEPTION 'HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_ROLLBACK_RESIDUAL';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END$$;

COMMENT ON TABLE hr_performance_legacy_ass_compute_weight_resolution IS
  'Append-only comparison of bs_ass_compute person.assessment-derived weights and the existing detail-derived template relation; never selects or overwrites a winner.';

REVOKE ALL ON hr_performance_legacy_person_assessment_evidence FROM PUBLIC;
REVOKE ALL ON hr_performance_legacy_ass_compute_weight_resolution FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_person_assessment_evidence_sha256(char,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_ass_compute_weight_evidence_sha256(
  uuid,char,integer,integer,integer,uuid,varchar,integer,uuid,varchar,varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_ass_compute_weight_expectation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_person_assessment_evidence_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_performance_yuzhou_ass_compute_weight_resolution_guard() FROM PUBLIC;
REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_lab(
  varchar,varchar,uuid,jsonb
) FROM PUBLIC;
REVOKE ALL ON PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_lab(uuid) FROM PUBLIC;

COMMIT;
