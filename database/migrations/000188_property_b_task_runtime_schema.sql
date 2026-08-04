BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.assignee_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.assignment_status
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.blocked_reason
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.blocked_until
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.claim_epoch
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.claim_token
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.claimed_at
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.created_at
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.is_deleted
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.outcome_at
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.outcome_code
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.outcome_source_version
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.source_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.source_type
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.source_version_at_generation
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.started_at
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.task_key
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.task_key_version
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.task_kind
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.updated_at
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment.version
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.action_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.actor_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.assignment_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.from_status
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.from_version
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.occurred_at
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.park_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.payload_hash
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.reason
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.tenant_id
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.to_status
-- B0_CATALOG_OBJECT column	public.biz_property_task_assignment_audit.to_version
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.biz_property_task_assignment_claim_epoch_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.biz_property_task_assignment_outcome_source_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.biz_property_task_assignment_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.biz_property_task_assignment_source_version_at_generation_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.biz_property_task_assignment_task_key_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.biz_property_task_assignment_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.ck_biz_property_task_assignment_active
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.ck_biz_property_task_assignment_blocked
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.ck_biz_property_task_assignment_open
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.ck_biz_property_task_assignment_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.ck_biz_property_task_assignment_terminal
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment.uq_biz_property_task_assignment_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_from_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_payload_hash_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_pkey
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_to_version_check
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.ck_biz_property_task_assignment_audit_status
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.ck_biz_property_task_assignment_audit_version
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.fk_biz_property_task_assignment_audit_assignment
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.uq_biz_property_task_assignment_audit_scope_id
-- B0_CATALOG_OBJECT constraint	public.biz_property_task_assignment_audit.uq_biz_property_task_assignment_audit_version
-- B0_CATALOG_OBJECT function	public.fn_property_task_audit_immutable()
-- B0_CATALOG_OBJECT index	public.biz_property_task_assignment_audit_pkey
-- B0_CATALOG_OBJECT index	public.biz_property_task_assignment_pkey
-- B0_CATALOG_OBJECT index	public.idx_property_task_assignee
-- B0_CATALOG_OBJECT index	public.idx_property_task_queue
-- B0_CATALOG_OBJECT index	public.idx_property_task_source
-- B0_CATALOG_OBJECT index	public.uq_biz_property_task_assignment_active_key
-- B0_CATALOG_OBJECT index	public.uq_biz_property_task_assignment_audit_scope_id
-- B0_CATALOG_OBJECT index	public.uq_biz_property_task_assignment_audit_version
-- B0_CATALOG_OBJECT index	public.uq_biz_property_task_assignment_scope_id
-- B0_CATALOG_OBJECT table	public.biz_property_task_assignment
-- B0_CATALOG_OBJECT table	public.biz_property_task_assignment_audit
-- B0_CATALOG_OBJECT trigger	public.biz_property_task_assignment_audit.trg_biz_property_task_assignment_audit_immutable
-- B0_CATALOG_OBJECTS_END

-- B0_DEFINITION_SIGNATURE_GUARD_START
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
INSERT INTO b0_catalog_target(kind,name) VALUES
  ('column','public.biz_property_task_assignment.assignee_id'),
  ('column','public.biz_property_task_assignment.assignment_status'),
  ('column','public.biz_property_task_assignment.blocked_reason'),
  ('column','public.biz_property_task_assignment.blocked_until'),
  ('column','public.biz_property_task_assignment.claim_epoch'),
  ('column','public.biz_property_task_assignment.claim_token'),
  ('column','public.biz_property_task_assignment.claimed_at'),
  ('column','public.biz_property_task_assignment.created_at'),
  ('column','public.biz_property_task_assignment.id'),
  ('column','public.biz_property_task_assignment.is_deleted'),
  ('column','public.biz_property_task_assignment.outcome_at'),
  ('column','public.biz_property_task_assignment.outcome_code'),
  ('column','public.biz_property_task_assignment.outcome_source_version'),
  ('column','public.biz_property_task_assignment.park_id'),
  ('column','public.biz_property_task_assignment.source_id'),
  ('column','public.biz_property_task_assignment.source_type'),
  ('column','public.biz_property_task_assignment.source_version_at_generation'),
  ('column','public.biz_property_task_assignment.started_at'),
  ('column','public.biz_property_task_assignment.task_key'),
  ('column','public.biz_property_task_assignment.task_key_version'),
  ('column','public.biz_property_task_assignment.task_kind'),
  ('column','public.biz_property_task_assignment.tenant_id'),
  ('column','public.biz_property_task_assignment.updated_at'),
  ('column','public.biz_property_task_assignment.version'),
  ('column','public.biz_property_task_assignment_audit.action_id'),
  ('column','public.biz_property_task_assignment_audit.actor_id'),
  ('column','public.biz_property_task_assignment_audit.assignment_id'),
  ('column','public.biz_property_task_assignment_audit.from_status'),
  ('column','public.biz_property_task_assignment_audit.from_version'),
  ('column','public.biz_property_task_assignment_audit.id'),
  ('column','public.biz_property_task_assignment_audit.occurred_at'),
  ('column','public.biz_property_task_assignment_audit.park_id'),
  ('column','public.biz_property_task_assignment_audit.payload_hash'),
  ('column','public.biz_property_task_assignment_audit.reason'),
  ('column','public.biz_property_task_assignment_audit.tenant_id'),
  ('column','public.biz_property_task_assignment_audit.to_status'),
  ('column','public.biz_property_task_assignment_audit.to_version'),
  ('constraint','public.biz_property_task_assignment.biz_property_task_assignment_claim_epoch_check'),
  ('constraint','public.biz_property_task_assignment.biz_property_task_assignment_outcome_source_version_check'),
  ('constraint','public.biz_property_task_assignment.biz_property_task_assignment_pkey'),
  ('constraint','public.biz_property_task_assignment.biz_property_task_assignment_source_version_at_generation_check'),
  ('constraint','public.biz_property_task_assignment.biz_property_task_assignment_task_key_version_check'),
  ('constraint','public.biz_property_task_assignment.biz_property_task_assignment_version_check'),
  ('constraint','public.biz_property_task_assignment.ck_biz_property_task_assignment_active'),
  ('constraint','public.biz_property_task_assignment.ck_biz_property_task_assignment_blocked'),
  ('constraint','public.biz_property_task_assignment.ck_biz_property_task_assignment_open'),
  ('constraint','public.biz_property_task_assignment.ck_biz_property_task_assignment_status'),
  ('constraint','public.biz_property_task_assignment.ck_biz_property_task_assignment_terminal'),
  ('constraint','public.biz_property_task_assignment.uq_biz_property_task_assignment_scope_id'),
  ('constraint','public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_from_version_check'),
  ('constraint','public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_payload_hash_check'),
  ('constraint','public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_pkey'),
  ('constraint','public.biz_property_task_assignment_audit.biz_property_task_assignment_audit_to_version_check'),
  ('constraint','public.biz_property_task_assignment_audit.ck_biz_property_task_assignment_audit_status'),
  ('constraint','public.biz_property_task_assignment_audit.ck_biz_property_task_assignment_audit_version'),
  ('constraint','public.biz_property_task_assignment_audit.fk_biz_property_task_assignment_audit_assignment'),
  ('constraint','public.biz_property_task_assignment_audit.uq_biz_property_task_assignment_audit_scope_id'),
  ('constraint','public.biz_property_task_assignment_audit.uq_biz_property_task_assignment_audit_version'),
  ('function','public.fn_property_task_audit_immutable()'),
  ('index','public.biz_property_task_assignment_audit_pkey'),
  ('index','public.biz_property_task_assignment_pkey'),
  ('index','public.idx_property_task_assignee'),
  ('index','public.idx_property_task_queue'),
  ('index','public.idx_property_task_source'),
  ('index','public.uq_biz_property_task_assignment_active_key'),
  ('index','public.uq_biz_property_task_assignment_audit_scope_id'),
  ('index','public.uq_biz_property_task_assignment_audit_version'),
  ('index','public.uq_biz_property_task_assignment_scope_id'),
  ('table','public.biz_property_task_assignment'),
  ('table','public.biz_property_task_assignment_audit'),
  ('trigger','public.biz_property_task_assignment_audit.trg_biz_property_task_assignment_audit_immutable');
CREATE TEMP VIEW b0_guard_catalog(kind,name,definition,signature_comment) AS

SELECT 'table'::text AS kind,n.nspname||'.'||c.relname AS name,
  jsonb_build_object('persistence',c.relpersistence::text,
    'partitionKey',coalesce(pg_get_partkeydef(c.oid),''),
    'rlsEnabled',c.relrowsecurity) AS definition,
  obj_description(c.oid,'pg_class') AS signature_comment
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t ON t.kind='table' AND t.name=n.nspname||'.'||c.relname
UNION ALL
SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,
  jsonb_build_object('dataType',format_type(a.atttypid,a.atttypmod),
    'default',coalesce(pg_get_expr(d.adbin,d.adrelid),''),
    'generated',a.attgenerated::text,'identity',a.attidentity::text,
    'notNull',a.attnotnull,'ordinal',a.attnum),
  col_description(c.oid,a.attnum)
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
JOIN b0_catalog_target t ON t.kind='column'
 AND t.name=n.nspname||'.'||c.relname||'.'||a.attname
WHERE a.attnum>0 AND NOT a.attisdropped
UNION ALL
SELECT 'constraint',n.nspname||'.'||c.relname||'.'||x.conname,
  jsonb_build_object('deferrable',x.condeferrable,
    'definition',pg_get_constraintdef(x.oid,false),
    'initiallyDeferred',x.condeferred,'type',x.contype::text),
  obj_description(x.oid,'pg_constraint')
FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t ON t.kind='constraint'
 AND t.name=n.nspname||'.'||c.relname||'.'||x.conname
UNION ALL
SELECT 'index',ni.nspname||'.'||i.relname,
  jsonb_build_object('definition',pg_get_indexdef(i.oid),
    'primary',x.indisprimary,'unique',x.indisunique,'valid',x.indisvalid),
  obj_description(i.oid,'pg_class')
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_namespace ni ON ni.oid=i.relnamespace
JOIN b0_catalog_target t ON t.kind='index' AND t.name=ni.nspname||'.'||i.relname
UNION ALL
SELECT 'function',n.nspname||'.'||p.proname||'('||
    pg_get_function_identity_arguments(p.oid)||')',
  jsonb_build_object('definition',pg_get_functiondef(p.oid),
    'language',l.lanname,'securityDefiner',p.prosecdef,
    'volatility',p.provolatile::text),
  obj_description(p.oid,'pg_proc')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
JOIN b0_catalog_target t ON t.kind='function'
 AND t.name=n.nspname||'.'||p.proname||'('||
   pg_get_function_identity_arguments(p.oid)||')'
UNION ALL
SELECT 'trigger',n.nspname||'.'||c.relname||'.'||g.tgname,
  jsonb_build_object('definition',pg_get_triggerdef(g.oid,false),
    'enabled',g.tgenabled::text),
  obj_description(g.oid,'pg_trigger')
FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t ON t.kind='trigger'
 AND t.name=n.nspname||'.'||c.relname||'.'||g.tgname
WHERE NOT g.tgisinternal
;
CREATE TEMP TABLE b0_preexisting_catalog_object (
  kind text NOT NULL,
  name text NOT NULL,
  definition_hash char(64) NOT NULL,
  signature_comment text,
  PRIMARY KEY(kind,name)
) ON COMMIT DROP;
INSERT INTO b0_preexisting_catalog_object
SELECT kind,name,
  encode(digest(convert_to(definition::text,'UTF8'),'sha256'),'hex'),
  signature_comment
FROM b0_guard_catalog;
DO $$
DECLARE invalid text;
BEGIN
  SELECT string_agg(kind||E'\t'||name, E'\n' ORDER BY kind COLLATE "C",name COLLATE "C")
  INTO invalid
  FROM b0_preexisting_catalog_object
  WHERE signature_comment IS DISTINCT FROM
    'b0-catalog-v1:'||definition_hash;
  IF invalid IS NOT NULL THEN
    RAISE EXCEPTION 'b0-preexisting-definition-drift:%', E'\n'||invalid
      USING ERRCODE='23514';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS biz_property_task_assignment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  task_key varchar(256) NOT NULL,
  task_key_version integer NOT NULL CHECK (task_key_version > 0),
  task_kind varchar(64) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  source_version_at_generation integer NOT NULL CHECK (source_version_at_generation > 0),
  assignment_status varchar(16) NOT NULL DEFAULT 'open',
  assignee_id uuid,
  claim_epoch bigint NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
  claim_token uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  claimed_at timestamptz,
  started_at timestamptz,
  blocked_reason varchar(1000),
  blocked_until timestamptz,
  outcome_code varchar(64),
  outcome_source_version integer CHECK (outcome_source_version > 0),
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_biz_property_task_assignment_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT ck_biz_property_task_assignment_status
    CHECK (assignment_status IN (
      'open', 'claimed', 'in_progress', 'blocked', 'closed', 'cancelled'
    )),
  CONSTRAINT ck_biz_property_task_assignment_open
    CHECK (
      assignment_status <> 'open'
      OR (assignee_id IS NULL AND claim_token IS NULL AND claimed_at IS NULL)
    ),
  CONSTRAINT ck_biz_property_task_assignment_active
    CHECK (
      assignment_status NOT IN ('claimed', 'in_progress', 'blocked')
      OR (assignee_id IS NOT NULL AND claim_token IS NOT NULL AND claimed_at IS NOT NULL)
    ),
  CONSTRAINT ck_biz_property_task_assignment_blocked
    CHECK ((assignment_status = 'blocked') = (blocked_reason IS NOT NULL)),
  CONSTRAINT ck_biz_property_task_assignment_terminal
    CHECK (
      (assignment_status IN ('closed', 'cancelled'))
      =
      (outcome_code IS NOT NULL AND outcome_source_version IS NOT NULL
       AND outcome_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_property_task_assignment_active_key
  ON biz_property_task_assignment (tenant_id, park_id, task_key)
  WHERE is_deleted = false
    AND assignment_status IN ('open', 'claimed', 'in_progress', 'blocked');

CREATE TABLE IF NOT EXISTS biz_property_task_assignment_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  assignment_id uuid NOT NULL,
  actor_id uuid,
  action_id varchar(128) NOT NULL,
  from_status varchar(16) NOT NULL,
  to_status varchar(16) NOT NULL,
  from_version integer NOT NULL CHECK (from_version > 0),
  to_version integer NOT NULL CHECK (to_version > 0),
  reason varchar(1000),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_biz_property_task_assignment_audit_assignment
    FOREIGN KEY (tenant_id, park_id, assignment_id)
    REFERENCES biz_property_task_assignment(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_biz_property_task_assignment_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_assignment_audit_version
    UNIQUE (tenant_id, park_id, assignment_id, to_version),
  CONSTRAINT ck_biz_property_task_assignment_audit_version
    CHECK (to_version = from_version + 1),
  CONSTRAINT ck_biz_property_task_assignment_audit_status
    CHECK (
      from_status IN ('open', 'claimed', 'in_progress', 'blocked', 'closed', 'cancelled')
      AND to_status IN ('open', 'claimed', 'in_progress', 'blocked', 'closed', 'cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_property_task_queue
  ON biz_property_task_assignment
    (tenant_id, park_id, assignment_status, task_kind, updated_at DESC, id DESC)
  WHERE is_deleted = false
    AND assignment_status IN ('open', 'claimed', 'in_progress', 'blocked');
CREATE INDEX IF NOT EXISTS idx_property_task_assignee
  ON biz_property_task_assignment
    (tenant_id, park_id, assignee_id, assignment_status, updated_at DESC, id DESC)
  WHERE is_deleted = false AND assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_task_source
  ON biz_property_task_assignment
    (tenant_id, park_id, source_type, source_id, updated_at DESC, id DESC)
  WHERE is_deleted = false;

CREATE OR REPLACE FUNCTION fn_property_task_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'property-task-audit-immutable' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE TRIGGER trg_biz_property_task_assignment_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_task_assignment_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_task_audit_immutable();

REVOKE UPDATE, DELETE ON biz_property_task_assignment_audit FROM PUBLIC;




DO $signature_guard$
DECLARE
  unresolved text;
  object_row record;
  signature text;
  relation_name text;
  object_name text;
BEGIN
  SELECT string_agg(target.kind||E'\t'||target.name,E'\n'
                    ORDER BY target.kind COLLATE "C",target.name COLLATE "C")
  INTO unresolved
  FROM b0_catalog_target target
  LEFT JOIN b0_guard_catalog actual
    ON actual.kind=target.kind AND actual.name=target.name
  WHERE actual.name IS NULL;
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'b0-structural-object-missing:%',E'\n'||unresolved
      USING ERRCODE='23514';
  END IF;

  FOR object_row IN
    SELECT catalog.*,
      encode(digest(convert_to(catalog.definition::text,'UTF8'),'sha256'),'hex') AS definition_hash
    FROM b0_guard_catalog catalog
    LEFT JOIN b0_preexisting_catalog_object old
      ON old.kind=catalog.kind AND old.name=catalog.name
    WHERE old.name IS NULL
    ORDER BY catalog.kind COLLATE "C",catalog.name COLLATE "C"
  LOOP
    signature := 'b0-catalog-v1:'||object_row.definition_hash;
    IF object_row.kind='table' THEN
      EXECUTE format('COMMENT ON TABLE %s IS %L',object_row.name,signature);
    ELSIF object_row.kind='column' THEN
      EXECUTE format('COMMENT ON COLUMN %s IS %L',object_row.name,signature);
    ELSIF object_row.kind='index' THEN
      EXECUTE format('COMMENT ON INDEX %s IS %L',object_row.name,signature);
    ELSIF object_row.kind='function' THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS %L',object_row.name,signature);
    ELSIF object_row.kind IN ('constraint','trigger') THEN
      relation_name := regexp_replace(object_row.name,'\.[^.]+$','');
      object_name := substring(object_row.name from '[^.]+$');
      IF object_row.kind='constraint' THEN
        EXECUTE format('COMMENT ON CONSTRAINT %I ON %s IS %L',
          object_name,relation_name,signature);
      ELSE
        EXECUTE format('COMMENT ON TRIGGER %I ON %s IS %L',
          object_name,relation_name,signature);
      END IF;
    END IF;
  END LOOP;

  SELECT string_agg(kind||E'\t'||name,E'\n'
                    ORDER BY kind COLLATE "C",name COLLATE "C")
  INTO unresolved
  FROM b0_guard_catalog
  WHERE signature_comment IS DISTINCT FROM
    'b0-catalog-v1:'||
    encode(digest(convert_to(definition::text,'UTF8'),'sha256'),'hex');
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'b0-definition-signature-write-failed:%',E'\n'||unresolved
      USING ERRCODE='23514';
  END IF;
END;
$signature_guard$;
-- B0_DEFINITION_SIGNATURE_GUARD_END

COMMIT;
