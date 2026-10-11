BEGIN;

CREATE FUNCTION hr_requisition_snapshot_valid(snapshot jsonb, requisition uuid, snapshot_version integer)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(jsonb_typeof(snapshot)='object'
  AND snapshot ?& ARRAY['id','version','requisitionCode','title','orgId','orgName','positionId','positionName','headcount','hiredCount','ownerUserId','ownerName','plannedOnboardDate','status','approvalNote','updatedAt']
  AND snapshot - ARRAY['id','version','requisitionCode','title','orgId','orgName','positionId','positionName','headcount','hiredCount','ownerUserId','ownerName','plannedOnboardDate','status','approvalNote','updatedAt']='{}'::jsonb
  AND snapshot->>'id'=requisition::text AND snapshot->'version'=to_jsonb(snapshot_version)
  AND jsonb_typeof(snapshot->'requisitionCode')='string' AND length(btrim(snapshot->>'requisitionCode')) BETWEEN 1 AND 64
  AND jsonb_typeof(snapshot->'title')='string' AND length(btrim(snapshot->>'title')) BETWEEN 1 AND 160
  AND jsonb_typeof(snapshot->'orgId')='string' AND snapshot->>'orgId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(snapshot->'ownerUserId')='string' AND snapshot->>'ownerUserId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(snapshot->'headcount')='number' AND (snapshot->>'headcount')::integer>0
  AND jsonb_typeof(snapshot->'hiredCount')='number' AND (snapshot->>'hiredCount')::integer>=0 AND (snapshot->>'hiredCount')::integer<=(snapshot->>'headcount')::integer
  AND snapshot->>'status' IN ('draft','open','paused','closed','cancelled')
  AND jsonb_typeof(snapshot->'updatedAt')='string' AND snapshot->>'updatedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
  AND NOT EXISTS(SELECT 1 FROM jsonb_each(snapshot) item WHERE item.key IN ('orgName','positionId','positionName','ownerName','plannedOnboardDate','approvalNote') AND jsonb_typeof(item.value) NOT IN ('string','null'))
  AND (snapshot->>'positionId' IS NULL OR snapshot->>'positionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  AND (snapshot->>'plannedOnboardDate' IS NULL OR snapshot->>'plannedOnboardDate' ~ '^\d{4}-\d{2}-\d{2}$'),false)
$$;

CREATE TABLE hr_requisition_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 requisition_id uuid NOT NULL, before_version integer NOT NULL, after_version integer NOT NULL,
 before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL, change_reason varchar(1000) NOT NULL,
 actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_requisition_history_requisition FOREIGN KEY(tenant_id,park_id,requisition_id) REFERENCES hr_recruitment_requisition(tenant_id,park_id,id),
 CONSTRAINT fk_hr_requisition_history_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_requisition_history_version UNIQUE(tenant_id,park_id,requisition_id,after_version),
 CONSTRAINT ck_hr_requisition_history_version CHECK(before_version>0 AND after_version=before_version+1),
 CONSTRAINT ck_hr_requisition_history_reason CHECK(length(btrim(change_reason))>0),
 CONSTRAINT ck_hr_requisition_history_before CHECK(hr_requisition_snapshot_valid(before_snapshot,requisition_id,before_version)),
 CONSTRAINT ck_hr_requisition_history_after CHECK(hr_requisition_snapshot_valid(after_snapshot,requisition_id,after_version))
);
CREATE INDEX ix_hr_requisition_history_requisition ON hr_requisition_history(tenant_id,park_id,requisition_id,after_version DESC,id DESC);
CREATE FUNCTION hr_requisition_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Recruitment requisition history is append-only'; END $$;
CREATE TRIGGER trg_hr_requisition_history_append_only BEFORE UPDATE OR DELETE ON hr_requisition_history FOR EACH ROW EXECUTE FUNCTION hr_requisition_history_append_only();

COMMIT;
