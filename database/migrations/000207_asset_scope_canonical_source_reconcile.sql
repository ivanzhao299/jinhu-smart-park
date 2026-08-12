BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtextextended('000207-asset-scope-canonical-source-reconcile', 0));

CREATE TABLE IF NOT EXISTS public.sys_asset_scope_canonical_reconcile_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_key varchar(64) NOT NULL,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  survivor_biz_park_id uuid NOT NULL,
  survivor_park_code varchar(64) NOT NULL,
  retired_biz_park_id uuid NOT NULL,
  retired_park_code varchar(64) NOT NULL,
  before_status smallint NOT NULL,
  after_status smallint NOT NULL,
  before_is_deleted boolean NOT NULL,
  after_is_deleted boolean NOT NULL,
  before_version integer NOT NULL,
  after_version integer NOT NULL,
  before_update_time timestamptz NOT NULL,
  after_update_time timestamptz NOT NULL,
  evidence_hash char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT uq_asset_scope_canonical_reconcile_retired
    UNIQUE (migration_key, tenant_id, park_id, retired_biz_park_id),
  CONSTRAINT fk_asset_scope_canonical_reconcile_survivor
    FOREIGN KEY (survivor_biz_park_id) REFERENCES public.biz_park(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_asset_scope_canonical_reconcile_retired
    FOREIGN KEY (retired_biz_park_id) REFERENCES public.biz_park(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_asset_scope_canonical_reconcile_migration
    CHECK (migration_key = '000207-canonical-source-v1'),
  CONSTRAINT ck_asset_scope_canonical_reconcile_transition
    CHECK (before_status = 1 AND after_status = 0
      AND before_is_deleted = false AND after_is_deleted = true
      AND after_version = before_version + 1
      AND after_update_time = occurred_at
      AND after_update_time >= before_update_time),
  CONSTRAINT ck_asset_scope_canonical_reconcile_hash
    CHECK (evidence_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_asset_scope_canonical_reconcile_scope
  ON public.sys_asset_scope_canonical_reconcile_audit
    (tenant_id, park_id, occurred_at, retired_biz_park_id);

CREATE OR REPLACE FUNCTION public.fn_asset_scope_canonical_reconcile_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'asset-scope-canonical-reconcile-audit-immutable' USING ERRCODE='55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_scope_canonical_reconcile_audit_immutable
  ON public.sys_asset_scope_canonical_reconcile_audit;
CREATE TRIGGER trg_asset_scope_canonical_reconcile_audit_immutable
BEFORE UPDATE OR DELETE ON public.sys_asset_scope_canonical_reconcile_audit
FOR EACH ROW EXECUTE FUNCTION public.fn_asset_scope_canonical_reconcile_audit_immutable();

LOCK TABLE public.sys_module IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.rel_tenant_module IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.sys_tenant IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.asset_park IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.biz_park IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.sys_property_runtime_control IN SHARE MODE;
LOCK TABLE public.sys_property_runtime_control_contract_audit IN SHARE MODE;

CREATE TEMP TABLE reconcile_000207_scope ON COMMIT DROP AS
WITH active_scope AS (
  SELECT btrim(assignment.tenant_id::text) AS tenant_id,
         btrim(assignment.park_id::text) AS park_id
  FROM public.rel_tenant_module assignment
  JOIN public.sys_module module
    ON module.id=assignment.module_id
   AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
  WHERE assignment.enabled=true AND assignment.status='enabled'
    AND assignment.is_deleted=false
    AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
    AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
  GROUP BY btrim(assignment.tenant_id::text),btrim(assignment.park_id::text)
), state AS (
  SELECT scope.tenant_id,scope.park_id,
    (SELECT count(*) FROM public.sys_tenant tenant
      WHERE btrim(tenant.tenant_id::text)=scope.tenant_id
        AND tenant.status=1 AND tenant.is_deleted=false
        AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())) AS tenant_count,
    (SELECT count(*) FROM public.asset_park projection
      WHERE btrim(projection.tenant_id::text)=scope.tenant_id
        AND btrim(projection.park_id::text)=scope.park_id
        AND projection.status='enabled' AND projection.is_deleted=false) AS asset_count,
    (SELECT count(*) FROM public.asset_park projection
      WHERE btrim(projection.tenant_id::text)=scope.tenant_id
        AND btrim(projection.park_id::text)=scope.park_id
        AND projection.is_deleted=false) AS asset_row_count,
    (SELECT min(projection.park_code) FROM public.asset_park projection
      WHERE btrim(projection.tenant_id::text)=scope.tenant_id
        AND btrim(projection.park_id::text)=scope.park_id
        AND projection.status='enabled' AND projection.is_deleted=false) AS projection_code,
    (SELECT count(*) FROM public.biz_park source
      WHERE btrim(source.tenant_id::text)=scope.tenant_id
        AND btrim(source.park_id::text)=scope.park_id
        AND source.status=1 AND source.is_deleted=false) AS source_count,
    (SELECT count(*) FROM public.sys_property_runtime_control control
      WHERE control.tenant_id=scope.tenant_id AND control.park_id=scope.park_id
        AND control.version=3
        AND control.contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'
        AND control.enabled=false AND control.control_mode='disabled'
        AND control.disabled_reason='b2a-contract-correction-000195') AS control_count,
    (SELECT count(*) FROM public.sys_property_runtime_control control
      WHERE control.tenant_id=scope.tenant_id AND control.park_id=scope.park_id) AS total_control_count,
    (SELECT count(*) FROM public.sys_property_runtime_control_contract_audit audit
      WHERE audit.tenant_id=scope.tenant_id AND audit.park_id=scope.park_id
        AND audit.correction_key IN ('b2a-contract-correction-000194','b2a-contract-correction-000195')) AS audit_count,
    (SELECT count(*) FROM public.sys_property_runtime_control_contract_audit audit
      WHERE audit.tenant_id=scope.tenant_id AND audit.park_id=scope.park_id) AS total_audit_count,
    (SELECT count(*) FROM public.sys_asset_scope_canonical_reconcile_audit audit
      WHERE audit.tenant_id=scope.tenant_id AND audit.park_id=scope.park_id
        AND audit.migration_key='000207-canonical-source-v1') AS reconcile_audit_count
  FROM active_scope scope
)
SELECT state.*,
  (SELECT count(*) FROM public.biz_park source
    WHERE btrim(source.tenant_id::text)=state.tenant_id
      AND btrim(source.park_id::text)=state.park_id
      AND source.status=1 AND source.is_deleted=false
      AND source.park_code=state.projection_code) AS matching_source_count
FROM state WHERE state.source_count>1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reconcile_000207_scope
    WHERE tenant_count<>1 OR asset_count<>1 OR asset_row_count<>1
       OR projection_code IS NULL OR matching_source_count<>1
       OR control_count<>12 OR total_control_count<>12
       OR audit_count<>24 OR total_audit_count<>24 OR reconcile_audit_count<>0
  ) THEN
    RAISE EXCEPTION 'asset-scope-canonical-source-reconcile-preflight-failed'
      USING ERRCODE='23514';
  END IF;
END;
$$;

CREATE TEMP TABLE reconcile_000207_retired ON COMMIT DROP AS
SELECT scope.tenant_id,scope.park_id,
       survivor.id AS survivor_id,survivor.park_code AS survivor_code,
       retired.id AS retired_id,retired.park_code AS retired_code,
       retired.status AS before_status,retired.is_deleted AS before_is_deleted,
       retired.version AS before_version,retired.update_time AS before_update_time,
       clock_timestamp() AS occurred_at
FROM reconcile_000207_scope scope
JOIN public.biz_park survivor
  ON btrim(survivor.tenant_id::text)=scope.tenant_id
 AND btrim(survivor.park_id::text)=scope.park_id
 AND survivor.status=1 AND survivor.is_deleted=false
 AND survivor.park_code=scope.projection_code
JOIN public.biz_park retired
  ON btrim(retired.tenant_id::text)=scope.tenant_id
 AND btrim(retired.park_id::text)=scope.park_id
 AND retired.status=1 AND retired.is_deleted=false
 AND retired.id<>survivor.id;

INSERT INTO public.sys_asset_scope_canonical_reconcile_audit (
  migration_key,tenant_id,park_id,survivor_biz_park_id,survivor_park_code,
  retired_biz_park_id,retired_park_code,before_status,after_status,
  before_is_deleted,after_is_deleted,before_version,after_version,
  before_update_time,after_update_time,evidence_hash,occurred_at
)
SELECT '000207-canonical-source-v1',tenant_id,park_id,survivor_id,survivor_code,
       retired_id,retired_code,before_status,0,before_is_deleted,true,
       before_version,before_version+1,before_update_time,occurred_at,
       encode(digest(convert_to(concat_ws(E'\n',
         '000207-canonical-source-v1',tenant_id,park_id,survivor_id::text,survivor_code,
         retired_id::text,retired_code,before_status::text,'0',before_is_deleted::text,
         'true',before_version::text,(before_version+1)::text,
         to_char(before_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'UTF8'),'sha256'),'hex'),
       occurred_at
FROM reconcile_000207_retired
ON CONFLICT (migration_key,tenant_id,park_id,retired_biz_park_id) DO NOTHING;

UPDATE public.biz_park target
SET status=0,is_deleted=true,version=target.version+1,
    update_by='migration:000207',update_time=retired.occurred_at,
    remark='000207 canonical source superseded by asset projection'
FROM reconcile_000207_retired retired
WHERE target.id=retired.retired_id
  AND target.status=retired.before_status
  AND target.is_deleted=retired.before_is_deleted
  AND target.version=retired.before_version;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reconcile_000207_scope scope
    WHERE (SELECT count(*) FROM public.biz_park source
      WHERE btrim(source.tenant_id::text)=scope.tenant_id
        AND btrim(source.park_id::text)=scope.park_id
        AND source.status=1 AND source.is_deleted=false)<>1
       OR NOT EXISTS (SELECT 1 FROM public.biz_park source
         WHERE btrim(source.tenant_id::text)=scope.tenant_id
           AND btrim(source.park_id::text)=scope.park_id
           AND source.status=1 AND source.is_deleted=false
           AND source.park_code=scope.projection_code)
  ) OR EXISTS (
    SELECT 1 FROM reconcile_000207_retired retired
    LEFT JOIN public.biz_park source ON source.id=retired.retired_id
    LEFT JOIN public.sys_asset_scope_canonical_reconcile_audit audit
      ON audit.migration_key='000207-canonical-source-v1'
     AND audit.tenant_id=retired.tenant_id AND audit.park_id=retired.park_id
     AND audit.retired_biz_park_id=retired.retired_id
    WHERE source.status<>0 OR source.is_deleted<>true
       OR source.version<>retired.before_version+1
       OR source.update_time<>retired.occurred_at OR audit.id IS NULL
  ) THEN
    RAISE EXCEPTION 'asset-scope-canonical-source-reconcile-postcondition-failed'
      USING ERRCODE='23514';
  END IF;
END;
$$;

COMMIT;
