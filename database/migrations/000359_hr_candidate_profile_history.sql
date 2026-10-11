BEGIN;

-- Exact complete encrypted snapshot shape; never accept extra plaintext or actor identity keys.
CREATE FUNCTION hr_candidate_profile_snapshot_valid(snapshot jsonb, candidate uuid, snapshot_version integer)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(
  jsonb_typeof(snapshot)='object'
  AND snapshot ?& ARRAY['id','version','candidateNo','fullName','requisitionId','requisitionTitle','stage','source','expectedOnboardDate','latestEvaluation','convertedEmployeeId','updatedAt','mobileEncrypted','mobileMasked','mobileFingerprint','emailEncrypted','emailMasked','emailFingerprint','identityEncrypted','identityMasked','identityFingerprint']
  AND snapshot - ARRAY['id','version','candidateNo','fullName','requisitionId','requisitionTitle','stage','source','expectedOnboardDate','latestEvaluation','convertedEmployeeId','updatedAt','mobileEncrypted','mobileMasked','mobileFingerprint','emailEncrypted','emailMasked','emailFingerprint','identityEncrypted','identityMasked','identityFingerprint']='{}'::jsonb
  AND snapshot->>'id'=candidate::text
  AND snapshot->'version'=to_jsonb(snapshot_version)
  AND jsonb_typeof(snapshot->'candidateNo')='string' AND length(btrim(snapshot->>'candidateNo')) BETWEEN 1 AND 64
  AND jsonb_typeof(snapshot->'fullName')='string' AND length(btrim(snapshot->>'fullName')) BETWEEN 1 AND 100
  AND jsonb_typeof(snapshot->'requisitionId')='string' AND snapshot->>'requisitionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(snapshot->'requisitionTitle')='string'
  AND snapshot->>'stage' IN ('talent_pool','screening','interview','offer','hired','rejected','withdrawn')
  AND jsonb_typeof(snapshot->'updatedAt')='string' AND snapshot->>'updatedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
  AND NOT EXISTS (SELECT 1 FROM jsonb_each(snapshot) item WHERE item.key IN ('source','expectedOnboardDate','latestEvaluation','convertedEmployeeId','mobileEncrypted','mobileMasked','mobileFingerprint','emailEncrypted','emailMasked','emailFingerprint','identityEncrypted','identityMasked','identityFingerprint') AND jsonb_typeof(item.value) NOT IN ('string','null'))
  AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(snapshot) item WHERE item.key IN ('mobileEncrypted','emailEncrypted','identityEncrypted') AND item.value IS NOT NULL AND item.value NOT LIKE 'enc:v1:%')
  AND (snapshot->>'expectedOnboardDate' IS NULL OR snapshot->>'expectedOnboardDate' ~ '^\d{4}-\d{2}-\d{2}$')
 ,false)
$$;

CREATE TABLE hr_candidate_profile_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 candidate_id uuid NOT NULL, before_version integer NOT NULL, after_version integer NOT NULL,
 before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL, change_reason varchar(1000) NOT NULL,
 actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_candidate_profile_history_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_profile_history_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_profile_history_version UNIQUE(tenant_id,park_id,candidate_id,after_version),
 CONSTRAINT ck_hr_candidate_profile_history_version CHECK(before_version>0 AND after_version=before_version+1),
 CONSTRAINT ck_hr_candidate_profile_history_reason CHECK(length(btrim(change_reason))>0),
 CONSTRAINT ck_hr_candidate_profile_history_before CHECK(hr_candidate_profile_snapshot_valid(before_snapshot,candidate_id,before_version)),
 CONSTRAINT ck_hr_candidate_profile_history_after CHECK(hr_candidate_profile_snapshot_valid(after_snapshot,candidate_id,after_version))
);
CREATE INDEX ix_hr_candidate_profile_history_candidate ON hr_candidate_profile_history(tenant_id,park_id,candidate_id,after_version DESC,id DESC);
CREATE FUNCTION hr_candidate_profile_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Candidate profile history is append-only'; END $$;
CREATE TRIGGER trg_hr_candidate_profile_history_append_only BEFORE UPDATE OR DELETE ON hr_candidate_profile_history FOR EACH ROW EXECUTE FUNCTION hr_candidate_profile_history_append_only();

COMMIT;
