BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.bundle_id
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.create_time
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.id
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.is_deleted
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.member_ordinal
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.permission_code
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.remark
-- B0_CATALOG_OBJECT column	public.rel_property_permission_bundle_member.version
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.create_time
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.dependency_kind
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.id
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.is_deleted
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.is_enabled
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.module_id
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.remark
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.required_module_id
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.update_time
-- B0_CATALOG_OBJECT column	public.sys_module_dependency.version
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.bundle_code
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.bundle_name
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.create_time
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.definition_hash
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.definition_version
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.id
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.is_deleted
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.remark
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.status
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.update_time
-- B0_CATALOG_OBJECT column	public.sys_property_permission_bundle.version
-- B0_CATALOG_OBJECT constraint	public.rel_property_permission_bundle_member.ck_rel_property_bundle_member_ordinal
-- B0_CATALOG_OBJECT constraint	public.rel_property_permission_bundle_member.ck_rel_property_bundle_member_version
-- B0_CATALOG_OBJECT constraint	public.rel_property_permission_bundle_member.fk_rel_property_bundle_member_bundle
-- B0_CATALOG_OBJECT constraint	public.rel_property_permission_bundle_member.rel_property_permission_bundle_member_pkey
-- B0_CATALOG_OBJECT constraint	public.sys_module_dependency.ck_sys_module_dependency_kind
-- B0_CATALOG_OBJECT constraint	public.sys_module_dependency.ck_sys_module_dependency_not_self
-- B0_CATALOG_OBJECT constraint	public.sys_module_dependency.ck_sys_module_dependency_version
-- B0_CATALOG_OBJECT constraint	public.sys_module_dependency.fk_sys_module_dependency_module
-- B0_CATALOG_OBJECT constraint	public.sys_module_dependency.fk_sys_module_dependency_required
-- B0_CATALOG_OBJECT constraint	public.sys_module_dependency.sys_module_dependency_pkey
-- B0_CATALOG_OBJECT constraint	public.sys_property_permission_bundle.ck_sys_property_permission_bundle_code
-- B0_CATALOG_OBJECT constraint	public.sys_property_permission_bundle.ck_sys_property_permission_bundle_hash
-- B0_CATALOG_OBJECT constraint	public.sys_property_permission_bundle.ck_sys_property_permission_bundle_status
-- B0_CATALOG_OBJECT constraint	public.sys_property_permission_bundle.ck_sys_property_permission_bundle_versions
-- B0_CATALOG_OBJECT constraint	public.sys_property_permission_bundle.sys_property_permission_bundle_pkey
-- B0_CATALOG_OBJECT index	public.idx_rel_property_bundle_member_permission_active
-- B0_CATALOG_OBJECT index	public.idx_sys_module_dependency_required_active
-- B0_CATALOG_OBJECT index	public.rel_property_permission_bundle_member_pkey
-- B0_CATALOG_OBJECT index	public.sys_module_dependency_pkey
-- B0_CATALOG_OBJECT index	public.sys_property_permission_bundle_pkey
-- B0_CATALOG_OBJECT index	public.uq_rel_property_bundle_member_active_code
-- B0_CATALOG_OBJECT index	public.uq_rel_property_bundle_member_active_ordinal
-- B0_CATALOG_OBJECT index	public.uq_sys_module_dependency_active
-- B0_CATALOG_OBJECT index	public.uq_sys_property_permission_bundle_active
-- B0_CATALOG_OBJECT table	public.rel_property_permission_bundle_member
-- B0_CATALOG_OBJECT table	public.sys_module_dependency
-- B0_CATALOG_OBJECT table	public.sys_property_permission_bundle
-- B0_CATALOG_OBJECTS_END

-- B0_DEFINITION_SIGNATURE_GUARD_START
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
INSERT INTO b0_catalog_target(kind,name) VALUES
  ('column','public.rel_property_permission_bundle_member.bundle_id'),
  ('column','public.rel_property_permission_bundle_member.create_time'),
  ('column','public.rel_property_permission_bundle_member.id'),
  ('column','public.rel_property_permission_bundle_member.is_deleted'),
  ('column','public.rel_property_permission_bundle_member.member_ordinal'),
  ('column','public.rel_property_permission_bundle_member.permission_code'),
  ('column','public.rel_property_permission_bundle_member.remark'),
  ('column','public.rel_property_permission_bundle_member.version'),
  ('column','public.sys_module_dependency.create_time'),
  ('column','public.sys_module_dependency.dependency_kind'),
  ('column','public.sys_module_dependency.id'),
  ('column','public.sys_module_dependency.is_deleted'),
  ('column','public.sys_module_dependency.is_enabled'),
  ('column','public.sys_module_dependency.module_id'),
  ('column','public.sys_module_dependency.remark'),
  ('column','public.sys_module_dependency.required_module_id'),
  ('column','public.sys_module_dependency.update_time'),
  ('column','public.sys_module_dependency.version'),
  ('column','public.sys_property_permission_bundle.bundle_code'),
  ('column','public.sys_property_permission_bundle.bundle_name'),
  ('column','public.sys_property_permission_bundle.create_time'),
  ('column','public.sys_property_permission_bundle.definition_hash'),
  ('column','public.sys_property_permission_bundle.definition_version'),
  ('column','public.sys_property_permission_bundle.id'),
  ('column','public.sys_property_permission_bundle.is_deleted'),
  ('column','public.sys_property_permission_bundle.remark'),
  ('column','public.sys_property_permission_bundle.status'),
  ('column','public.sys_property_permission_bundle.update_time'),
  ('column','public.sys_property_permission_bundle.version'),
  ('constraint','public.rel_property_permission_bundle_member.ck_rel_property_bundle_member_ordinal'),
  ('constraint','public.rel_property_permission_bundle_member.ck_rel_property_bundle_member_version'),
  ('constraint','public.rel_property_permission_bundle_member.fk_rel_property_bundle_member_bundle'),
  ('constraint','public.rel_property_permission_bundle_member.rel_property_permission_bundle_member_pkey'),
  ('constraint','public.sys_module_dependency.ck_sys_module_dependency_kind'),
  ('constraint','public.sys_module_dependency.ck_sys_module_dependency_not_self'),
  ('constraint','public.sys_module_dependency.ck_sys_module_dependency_version'),
  ('constraint','public.sys_module_dependency.fk_sys_module_dependency_module'),
  ('constraint','public.sys_module_dependency.fk_sys_module_dependency_required'),
  ('constraint','public.sys_module_dependency.sys_module_dependency_pkey'),
  ('constraint','public.sys_property_permission_bundle.ck_sys_property_permission_bundle_code'),
  ('constraint','public.sys_property_permission_bundle.ck_sys_property_permission_bundle_hash'),
  ('constraint','public.sys_property_permission_bundle.ck_sys_property_permission_bundle_status'),
  ('constraint','public.sys_property_permission_bundle.ck_sys_property_permission_bundle_versions'),
  ('constraint','public.sys_property_permission_bundle.sys_property_permission_bundle_pkey'),
  ('index','public.idx_rel_property_bundle_member_permission_active'),
  ('index','public.idx_sys_module_dependency_required_active'),
  ('index','public.rel_property_permission_bundle_member_pkey'),
  ('index','public.sys_module_dependency_pkey'),
  ('index','public.sys_property_permission_bundle_pkey'),
  ('index','public.uq_rel_property_bundle_member_active_code'),
  ('index','public.uq_rel_property_bundle_member_active_ordinal'),
  ('index','public.uq_sys_module_dependency_active'),
  ('index','public.uq_sys_property_permission_bundle_active'),
  ('table','public.rel_property_permission_bundle_member'),
  ('table','public.sys_module_dependency'),
  ('table','public.sys_property_permission_bundle');
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

CREATE TABLE IF NOT EXISTS sys_module_dependency (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id uuid NOT NULL,
  required_module_id uuid NOT NULL,
  dependency_kind varchar(16) NOT NULL DEFAULT 'hard',
  is_enabled boolean NOT NULL DEFAULT true,
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_sys_module_dependency_not_self CHECK (module_id <> required_module_id),
  CONSTRAINT ck_sys_module_dependency_kind CHECK (dependency_kind IN ('hard')),
  CONSTRAINT ck_sys_module_dependency_version CHECK (version > 0),
  CONSTRAINT fk_sys_module_dependency_module
    FOREIGN KEY (module_id) REFERENCES sys_module(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sys_module_dependency_required
    FOREIGN KEY (required_module_id) REFERENCES sys_module(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_module_dependency_active
  ON sys_module_dependency (module_id, required_module_id, dependency_kind)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_sys_module_dependency_required_active
  ON sys_module_dependency (required_module_id, module_id)
  WHERE is_deleted = false AND is_enabled = true;

DO $$
DECLARE
  resolved_count integer;
BEGIN
  SELECT count(*) INTO resolved_count
  FROM (VALUES ('homestay', 'asset'), ('housing_rental', 'asset')) pair(module_code, required_code)
  JOIN sys_module module
    ON module.module_code = pair.module_code AND module.status = 1 AND module.is_deleted = false
  JOIN sys_module required
    ON required.module_code = pair.required_code AND required.status = 1 AND required.is_deleted = false;
  IF resolved_count <> 2 THEN
    RAISE EXCEPTION 'property-module-dependency-preflight-failed' USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO sys_module_dependency (
  module_id, required_module_id, dependency_kind, is_enabled, remark
)
SELECT module.id, required.id, 'hard', true, 'PR192 Track B frozen hard dependency'
FROM (VALUES ('homestay', 'asset'), ('housing_rental', 'asset')) pair(module_code, required_code)
JOIN sys_module module
  ON module.module_code = pair.module_code AND module.status = 1 AND module.is_deleted = false
JOIN sys_module required
  ON required.module_code = pair.required_code AND required.status = 1 AND required.is_deleted = false
ON CONFLICT (module_id, required_module_id, dependency_kind) WHERE is_deleted = false
DO NOTHING;

CREATE TABLE IF NOT EXISTS sys_property_permission_bundle (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_code varchar(128) NOT NULL,
  bundle_name varchar(100) NOT NULL,
  definition_version integer NOT NULL DEFAULT 1,
  definition_hash char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'enabled',
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_sys_property_permission_bundle_code
    CHECK (bundle_code ~ '^property-bundle:[a-z][a-z0-9-]*$'),
  CONSTRAINT ck_sys_property_permission_bundle_hash
    CHECK (definition_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sys_property_permission_bundle_status
    CHECK (status IN ('enabled', 'disabled')),
  CONSTRAINT ck_sys_property_permission_bundle_versions
    CHECK (definition_version > 0 AND version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_property_permission_bundle_active
  ON sys_property_permission_bundle (bundle_code) WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS rel_property_permission_bundle_member (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_id uuid NOT NULL,
  permission_code varchar(128) NOT NULL,
  member_ordinal smallint NOT NULL,
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_rel_property_bundle_member_ordinal CHECK (member_ordinal > 0),
  CONSTRAINT ck_rel_property_bundle_member_version CHECK (version > 0),
  CONSTRAINT fk_rel_property_bundle_member_bundle
    FOREIGN KEY (bundle_id) REFERENCES sys_property_permission_bundle(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_property_bundle_member_active_code
  ON rel_property_permission_bundle_member (bundle_id, permission_code) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_property_bundle_member_active_ordinal
  ON rel_property_permission_bundle_member (bundle_id, member_ordinal) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rel_property_bundle_member_permission_active
  ON rel_property_permission_bundle_member (permission_code, bundle_id) WHERE is_deleted = false;

CREATE TEMP TABLE b0_signed_bundle (
  bundle_code varchar(128) PRIMARY KEY,
  bundle_name varchar(100) NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE b0_signed_bundle_member (
  bundle_code varchar(128) NOT NULL,
  member_ordinal smallint NOT NULL,
  permission_code varchar(128) NOT NULL,
  PRIMARY KEY (bundle_code, member_ordinal),
  UNIQUE (bundle_code, permission_code)
) ON COMMIT DROP;

INSERT INTO b0_signed_bundle VALUES
  ('property-bundle:property-party-profile-clerk', '相对方资料录入员'),
  ('property-bundle:property-identity-operator', '身份资料录入员'),
  ('property-bundle:property-identity-verifier', '实名核验员'),
  ('property-bundle:property-homestay-task-operator', '民宿任务处理人'),
  ('property-bundle:property-housing-operator', '住房出租运营人员'),
  ('property-bundle:property-asset-manager', '共享房产资产管理员'),
  ('property-bundle:property-homestay-finance-operator', '民宿财务操作员'),
  ('property-bundle:property-housing-finance-operator', '住房出租财务操作员'),
  ('property-bundle:property-homestay-approver', '民宿审批人'),
  ('property-bundle:property-housing-approver', '住房出租审批人'),
  ('property-bundle:property-homestay-task-supervisor', '民宿任务督办人'),
  ('property-bundle:property-housing-task-supervisor', '住房出租任务督办人'),
  ('property-bundle:property-auditor', '房产业务审计员'),
  ('property-bundle:property-event-delivery-operator', '事件投递事故处置员'),
  ('property-bundle:property-approval-incident-operator', '审批执行事故处置员'),
  ('property-bundle:property-task-admin', '房产业务任务投影管理员');

INSERT INTO b0_signed_bundle_member VALUES
  ('property-bundle:property-party-profile-clerk',1,'asset:party'),
  ('property-bundle:property-party-profile-clerk',2,'party:read'),
  ('property-bundle:property-party-profile-clerk',3,'party:create'),
  ('property-bundle:property-party-profile-clerk',4,'party:update'),
  ('property-bundle:property-identity-operator',1,'asset:party'),
  ('property-bundle:property-identity-operator',2,'asset:identity-submissions:page'),
  ('property-bundle:property-identity-operator',3,'party:read'),
  ('property-bundle:property-identity-operator',4,'party:identity_update'),
  ('property-bundle:property-identity-operator',5,'file:read'),
  ('property-bundle:property-identity-operator',6,'file:upload'),
  ('property-bundle:property-identity-operator',7,'file:delete'),
  ('property-bundle:property-identity-verifier',1,'asset:party'),
  ('property-bundle:property-identity-verifier',2,'asset:identity-submissions:page'),
  ('property-bundle:property-identity-verifier',3,'party:read'),
  ('property-bundle:property-identity-verifier',4,'party:identity_verify'),
  ('property-bundle:property-identity-verifier',5,'file:read'),
  ('property-bundle:property-identity-verifier',6,'file:download'),
  ('property-bundle:property-homestay-task-operator',1,'homestay:tasks:page'),
  ('property-bundle:property-homestay-task-operator',2,'property:notifications:page'),
  ('property-bundle:property-homestay-task-operator',3,'property_task:read'),
  ('property-bundle:property-homestay-task-operator',4,'property_task:claim'),
  ('property-bundle:property-homestay-task-operator',5,'property_task:process'),
  ('property-bundle:property-homestay-task-operator',6,'property_task:release'),
  ('property-bundle:property-homestay-task-operator',7,'property_notification:read'),
  ('property-bundle:property-homestay-task-operator',8,'property_notification:mark_read'),
  ('property-bundle:property-housing-operator',1,'housing:tasks:page'),
  ('property-bundle:property-housing-operator',2,'property:notifications:page'),
  ('property-bundle:property-housing-operator',3,'property_approval:create'),
  ('property-bundle:property-housing-operator',4,'property_approval:read'),
  ('property-bundle:property-housing-operator',5,'property_approval:withdraw'),
  ('property-bundle:property-housing-operator',6,'property_task:read'),
  ('property-bundle:property-housing-operator',7,'property_task:claim'),
  ('property-bundle:property-housing-operator',8,'property_task:process'),
  ('property-bundle:property-housing-operator',9,'property_task:release'),
  ('property-bundle:property-housing-operator',10,'property_notification:read'),
  ('property-bundle:property-housing-operator',11,'property_notification:mark_read'),
  ('property-bundle:property-asset-manager',1,'asset:property-operations:page'),
  ('property-bundle:property-asset-manager',2,'asset:property-occupancies:page'),
  ('property-bundle:property-asset-manager',3,'asset:property-mode-transitions:page'),
  ('property-bundle:property-asset-manager',4,'property:notifications:page'),
  ('property-bundle:property-asset-manager',5,'property_operation:read'),
  ('property-bundle:property-asset-manager',6,'property_operation:update'),
  ('property-bundle:property-asset-manager',7,'property_operation:transition_mode'),
  ('property-bundle:property-asset-manager',8,'property_occupancy:read'),
  ('property-bundle:property-asset-manager',9,'property_occupancy:force_release'),
  ('property-bundle:property-asset-manager',10,'property_approval:create'),
  ('property-bundle:property-asset-manager',11,'property_approval:read'),
  ('property-bundle:property-asset-manager',12,'property_approval:withdraw'),
  ('property-bundle:property-asset-manager',13,'property_task:read'),
  ('property-bundle:property-asset-manager',14,'property_notification:read'),
  ('property-bundle:property-asset-manager',15,'property_notification:mark_read'),
  ('property-bundle:property-homestay-finance-operator',1,'homestay:finance:page'),
  ('property-bundle:property-homestay-finance-operator',2,'homestay:bookings:page'),
  ('property-bundle:property-homestay-finance-operator',3,'homestay:finance:read'),
  ('property-bundle:property-homestay-finance-operator',4,'homestay:finance:register'),
  ('property-bundle:property-homestay-finance-operator',5,'homestay:finance:waive'),
  ('property-bundle:property-homestay-finance-operator',6,'homestay:booking:read'),
  ('property-bundle:property-homestay-finance-operator',7,'property:notifications:page'),
  ('property-bundle:property-homestay-finance-operator',8,'property_approval:create'),
  ('property-bundle:property-homestay-finance-operator',9,'property_approval:read'),
  ('property-bundle:property-homestay-finance-operator',10,'property_approval:withdraw'),
  ('property-bundle:property-homestay-finance-operator',11,'property_notification:read'),
  ('property-bundle:property-homestay-finance-operator',12,'property_notification:mark_read'),
  ('property-bundle:property-housing-finance-operator',1,'housing:finance:page'),
  ('property-bundle:property-housing-finance-operator',2,'housing:finance:read'),
  ('property-bundle:property-housing-finance-operator',3,'housing:finance:register'),
  ('property-bundle:property-housing-finance-operator',4,'housing:finance:waive'),
  ('property-bundle:property-housing-finance-operator',5,'property:notifications:page'),
  ('property-bundle:property-housing-finance-operator',6,'property_approval:create'),
  ('property-bundle:property-housing-finance-operator',7,'property_approval:read'),
  ('property-bundle:property-housing-finance-operator',8,'property_approval:withdraw'),
  ('property-bundle:property-housing-finance-operator',9,'property_notification:read'),
  ('property-bundle:property-housing-finance-operator',10,'property_notification:mark_read'),
  ('property-bundle:property-homestay-approver',1,'homestay:tasks:page'),
  ('property-bundle:property-homestay-approver',2,'property:notifications:page'),
  ('property-bundle:property-homestay-approver',3,'property_approval:read'),
  ('property-bundle:property-homestay-approver',4,'property_approval:decide'),
  ('property-bundle:property-homestay-approver',5,'property_task:read'),
  ('property-bundle:property-homestay-approver',6,'property_task:claim'),
  ('property-bundle:property-homestay-approver',7,'property_task:process'),
  ('property-bundle:property-homestay-approver',8,'property_task:release'),
  ('property-bundle:property-homestay-approver',9,'property_notification:read'),
  ('property-bundle:property-homestay-approver',10,'property_notification:mark_read'),
  ('property-bundle:property-housing-approver',1,'housing:tasks:page'),
  ('property-bundle:property-housing-approver',2,'property:notifications:page'),
  ('property-bundle:property-housing-approver',3,'property_approval:read'),
  ('property-bundle:property-housing-approver',4,'property_approval:decide'),
  ('property-bundle:property-housing-approver',5,'property_task:read'),
  ('property-bundle:property-housing-approver',6,'property_task:claim'),
  ('property-bundle:property-housing-approver',7,'property_task:process'),
  ('property-bundle:property-housing-approver',8,'property_task:release'),
  ('property-bundle:property-housing-approver',9,'property_notification:read'),
  ('property-bundle:property-housing-approver',10,'property_notification:mark_read'),
  ('property-bundle:property-homestay-task-supervisor',1,'homestay:tasks:page'),
  ('property-bundle:property-homestay-task-supervisor',2,'property:notifications:page'),
  ('property-bundle:property-homestay-task-supervisor',3,'property_task:read'),
  ('property-bundle:property-homestay-task-supervisor',4,'property_task:supervise'),
  ('property-bundle:property-homestay-task-supervisor',5,'property_notification:read'),
  ('property-bundle:property-homestay-task-supervisor',6,'property_notification:mark_read'),
  ('property-bundle:property-housing-task-supervisor',1,'housing:tasks:page'),
  ('property-bundle:property-housing-task-supervisor',2,'property:notifications:page'),
  ('property-bundle:property-housing-task-supervisor',3,'property_task:read'),
  ('property-bundle:property-housing-task-supervisor',4,'property_task:supervise'),
  ('property-bundle:property-housing-task-supervisor',5,'property_notification:read'),
  ('property-bundle:property-housing-task-supervisor',6,'property_notification:mark_read'),
  ('property-bundle:property-auditor',1,'asset:identity-submissions:page'),
  ('property-bundle:property-auditor',2,'asset:property-occupancies:page'),
  ('property-bundle:property-auditor',3,'asset:property-mode-transitions:page'),
  ('property-bundle:property-auditor',4,'party:read'),
  ('property-bundle:property-auditor',5,'party:sensitive_read'),
  ('property-bundle:property-auditor',6,'audit:read'),
  ('property-bundle:property-auditor',7,'property_approval:read'),
  ('property-bundle:property-auditor',8,'property_task:read'),
  ('property-bundle:property-event-delivery-operator',1,'property:event-delivery-incidents:page'),
  ('property-bundle:property-event-delivery-operator',2,'property_event:read_incident'),
  ('property-bundle:property-event-delivery-operator',3,'property_event:replay'),
  ('property-bundle:property-event-delivery-operator',4,'audit:read'),
  ('property-bundle:property-approval-incident-operator',1,'property:approval-incidents:page'),
  ('property-bundle:property-approval-incident-operator',2,'property_approval:read_incident'),
  ('property-bundle:property-approval-incident-operator',3,'property_approval:read'),
  ('property-bundle:property-approval-incident-operator',4,'property_approval:retry'),
  ('property-bundle:property-approval-incident-operator',5,'audit:read'),
  ('property-bundle:property-task-admin',1,'property_task:read'),
  ('property-bundle:property-task-admin',2,'property_task:rebuild'),
  ('property-bundle:property-task-admin',3,'audit:read');

WITH bundle_hash AS (
  SELECT
    bundle.bundle_code,
    bundle.bundle_name,
    encode(
      digest(
        convert_to(
          'property-bundle-v1' || chr(10)
          || bundle.bundle_code || chr(9) || bundle.bundle_name || chr(10)
          || string_agg(
               lpad(member.member_ordinal::text, 4, '0') || chr(9)
               || member.permission_code || chr(10),
               '' ORDER BY member.member_ordinal
             ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS definition_hash
  FROM b0_signed_bundle bundle
  JOIN b0_signed_bundle_member member USING (bundle_code)
  GROUP BY bundle.bundle_code, bundle.bundle_name
)
INSERT INTO sys_property_permission_bundle (
  bundle_code, bundle_name, definition_version, definition_hash, status, remark
)
SELECT bundle_code, bundle_name, 1, definition_hash, 'enabled',
       'PR192 Track B frozen permission bundle'
FROM bundle_hash
ON CONFLICT (bundle_code) WHERE is_deleted = false DO NOTHING;

INSERT INTO rel_property_permission_bundle_member (
  bundle_id, permission_code, member_ordinal, remark
)
SELECT bundle.id, member.permission_code, member.member_ordinal,
       'PR192 Track B frozen permission bundle member'
FROM b0_signed_bundle_member member
JOIN sys_property_permission_bundle bundle
  ON bundle.bundle_code = member.bundle_code
 AND bundle.is_deleted = false
ON CONFLICT (bundle_id, member_ordinal) WHERE is_deleted = false DO NOTHING;

DO $$
DECLARE
  drift_count integer;
BEGIN
  WITH expected_bundle AS (
    SELECT
      signed.bundle_code,
      signed.bundle_name,
      encode(
        digest(
          convert_to(
            'property-bundle-v1' || chr(10)
            || signed.bundle_code || chr(9) || signed.bundle_name || chr(10)
            || string_agg(
                 lpad(member.member_ordinal::text, 4, '0') || chr(9)
                 || member.permission_code || chr(10),
                 '' ORDER BY member.member_ordinal
               ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) AS definition_hash
    FROM b0_signed_bundle signed
    JOIN b0_signed_bundle_member member USING (bundle_code)
    GROUP BY signed.bundle_code, signed.bundle_name
  ),
  actual_bundle AS (
    SELECT bundle_code, bundle_name, definition_version, definition_hash, status
    FROM sys_property_permission_bundle
    WHERE is_deleted = false
      AND bundle_code IN (SELECT bundle_code FROM b0_signed_bundle)
  ),
  bundle_drift AS (
    (SELECT bundle_code, bundle_name, 1 AS definition_version, definition_hash,
            'enabled'::varchar AS status
     FROM expected_bundle
     EXCEPT
     SELECT bundle_code, bundle_name, definition_version, definition_hash, status
     FROM actual_bundle)
    UNION ALL
    (SELECT bundle_code, bundle_name, definition_version, definition_hash, status
     FROM actual_bundle
     EXCEPT
     SELECT bundle_code, bundle_name, 1, definition_hash, 'enabled'::varchar
     FROM expected_bundle)
  ),
  actual_member AS (
    SELECT bundle.bundle_code, member.member_ordinal, member.permission_code
    FROM sys_property_permission_bundle bundle
    JOIN rel_property_permission_bundle_member member
      ON member.bundle_id = bundle.id AND member.is_deleted = false
    WHERE bundle.is_deleted = false
      AND bundle.bundle_code IN (SELECT bundle_code FROM b0_signed_bundle)
  ),
  member_drift AS (
    (SELECT * FROM b0_signed_bundle_member EXCEPT SELECT * FROM actual_member)
    UNION ALL
    (SELECT * FROM actual_member EXCEPT SELECT * FROM b0_signed_bundle_member)
  )
  SELECT
    (SELECT count(*) FROM bundle_drift)
    + (SELECT count(*) FROM member_drift)
  INTO drift_count;
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'property-bundle-definition-drift' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sys_module_dependency dependency
    JOIN sys_module module ON module.id = dependency.module_id
    JOIN sys_module required ON required.id = dependency.required_module_id
    WHERE (module.module_code, required.module_code) IN (
      ('homestay', 'asset'), ('housing_rental', 'asset')
    )
      AND (
        dependency.dependency_kind <> 'hard'
        OR dependency.is_enabled <> true
        OR dependency.is_deleted <> false
      )
  ) THEN
    RAISE EXCEPTION 'property-module-dependency-definition-drift' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TEMP TABLE b0_business_target_scope (
  tenant_key text,
  park_key text,
  assignment_audit_ids text[] NOT NULL,
  UNIQUE NULLS NOT DISTINCT (tenant_key, park_key)
) ON COMMIT DROP;
INSERT INTO b0_business_target_scope(tenant_key,park_key,assignment_audit_ids)
SELECT
  btrim(assignment.tenant_id),
  btrim(assignment.park_id),
  array_agg(assignment.id::text ORDER BY assignment.id)
FROM rel_tenant_module assignment
JOIN sys_module module
  ON module.id=assignment.module_id
 AND module.module_code='asset'
 AND module.status=1
 AND module.is_deleted=false
WHERE assignment.enabled=true
  AND assignment.status='enabled'
  AND assignment.is_deleted=false
  AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
  AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
GROUP BY btrim(assignment.tenant_id),btrim(assignment.park_id);

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM b0_business_target_scope scope
  WHERE scope.tenant_key IS NULL OR scope.park_key IS NULL
     OR lower(scope.tenant_key) IN (
       '','0','all','global','*','00000000-0000-0000-0000-000000000000'
     )
     OR lower(scope.park_key) IN (
       '','0','all','global','*','00000000-0000-0000-0000-000000000000'
     )
     OR (
       SELECT count(*) FROM sys_tenant tenant
       WHERE btrim(tenant.tenant_id)=scope.tenant_key
         AND tenant.status=1 AND tenant.is_deleted=false
         AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())
     ) <> 1
     OR (
       SELECT count(*) FROM asset_park park
       WHERE btrim(park.tenant_id)=scope.tenant_key
         AND btrim(park.park_id)=scope.park_key
         AND park.status='enabled' AND park.is_deleted=false
     ) <> 1;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'property-business-scope-preflight-failed'
      USING ERRCODE='23514';
  END IF;
END;
$$;

CREATE TEMP TABLE b0_validated_business_target_scope (
  tenant_key text NOT NULL,
  park_key text NOT NULL,
  tenant_entity_uuid uuid NOT NULL,
  park_entity_uuid uuid NOT NULL,
  assignment_audit_ids text[] NOT NULL,
  PRIMARY KEY (tenant_key,park_key)
) ON COMMIT DROP;
INSERT INTO b0_validated_business_target_scope(
  tenant_key,park_key,tenant_entity_uuid,park_entity_uuid,assignment_audit_ids
)
SELECT scope.tenant_key,scope.park_key,tenant.id,park.id,scope.assignment_audit_ids
FROM b0_business_target_scope scope
JOIN sys_tenant tenant
  ON btrim(tenant.tenant_id)=scope.tenant_key
 AND tenant.status=1 AND tenant.is_deleted=false
 AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())
JOIN asset_park park
  ON btrim(park.tenant_id)=scope.tenant_key
 AND btrim(park.park_id)=scope.park_key
 AND park.status='enabled' AND park.is_deleted=false;

DO $$
DECLARE
  expected_tenants integer;
  valid_parents integer;
BEGIN
  WITH target_scope AS (
    SELECT DISTINCT tenant_key
    FROM b0_validated_business_target_scope
  ),
  asset_parent AS (
    SELECT tenant_id AS tenant_key, count(*) AS parent_count
    FROM sys_permission
    WHERE code = 'asset' AND is_enabled = true AND status = 'enabled' AND is_deleted = false
    GROUP BY tenant_id
  )
  SELECT
    (SELECT count(*) FROM target_scope),
    (SELECT count(*) FROM target_scope scope
      JOIN asset_parent parent
        ON parent.tenant_key=scope.tenant_key
      WHERE parent.parent_count = 1)
  INTO expected_tenants, valid_parents;
  IF expected_tenants <> valid_parents THEN
    RAISE EXCEPTION 'property-permission-parent-preflight-failed' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TEMP TABLE b0_signed_permission_code (
  code varchar(128) PRIMARY KEY
) ON COMMIT DROP;
INSERT INTO b0_signed_permission_code VALUES
  ('party:identity_update'),
  ('party:identity_verify'),
  ('property_approval:create'),
  ('property_approval:read'),
  ('property_approval:decide'),
  ('property_approval:withdraw'),
  ('property_approval:retry'),
  ('property_approval:read_incident'),
  ('property_event:read_incident'),
  ('property_event:replay'),
  ('property_task:read'),
  ('property_task:claim'),
  ('property_task:process'),
  ('property_task:release'),
  ('property_task:supervise'),
  ('property_task:rebuild'),
  ('property_notification:read'),
  ('property_notification:mark_read'),
  ('asset:identity-submissions:page'),
  ('asset:property-operations:page'),
  ('asset:property-occupancies:page'),
  ('asset:property-mode-transitions:page'),
  ('property:notifications:page'),
  ('property:event-delivery-incidents:page'),
  ('property:approval-incidents:page');

UPDATE sys_permission permission
SET api_path='/api/v1/property/occupancies/:occupancyId/release',
    update_time=clock_timestamp(),
    version=permission.version+1
WHERE permission.code='property_occupancy:force_release'
  AND permission.is_deleted=false
  AND permission.api_path IS DISTINCT FROM '/api/v1/property/occupancies/:occupancyId/release'
  AND EXISTS (
    SELECT 1
    FROM b0_validated_business_target_scope scope
    WHERE scope.tenant_key=permission.tenant_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM sys_permission track_b_marker
    WHERE track_b_marker.tenant_id=permission.tenant_id
      AND track_b_marker.code='property_task:read'
      AND track_b_marker.remark='PR192 Track B frozen permission definition'
      AND track_b_marker.is_deleted=false
  );

WITH target_scope AS (
  SELECT tenant_key,park_key
  FROM b0_validated_business_target_scope
),
asset_parent AS (
  SELECT
    tenant_id AS tenant_key,
    (array_agg(id ORDER BY id))[1] AS parent_id,
    count(*) AS parent_count
  FROM sys_permission
  WHERE code = 'asset' AND is_enabled = true AND status = 'enabled' AND is_deleted = false
  GROUP BY tenant_id
),
permission_scope AS (
  SELECT tenant_key,park_key,parent_id
  FROM (
    SELECT scope.tenant_key,scope.park_key,parent.parent_id,
      row_number() OVER (
        PARTITION BY scope.tenant_key
        ORDER BY convert_to(scope.park_key,'UTF8')
      ) AS park_ordinal
    FROM target_scope scope
    JOIN asset_parent parent
      ON parent.tenant_key=scope.tenant_key
     AND parent.parent_count=1
  ) ranked
  WHERE park_ordinal=1
),
signed_permission(
  code,name,resource,action,permission_type,perm_type,api_method,api_path,
  frontend_route,sort_no,permission_level,parent_required
) AS (
  VALUES
    ('party:identity_update','身份资料录入','biz.party_identity','update','api',40,NULL,NULL,'/assets/identity-submissions',8101,3,false),
    ('party:identity_verify','身份资料核验','biz.party_identity','verify','api',40,'POST','/api/v1/property/identity-submissions/:submissionId/decisions','/assets/identity-submissions',8102,3,false),
    ('property_approval:create','房产业务审批申请','biz.property_approval','create','api',40,NULL,NULL,NULL,8110,3,false),
    ('property_approval:read','房产业务审批读取','biz.property_approval','read','api',40,'GET','/api/v1/property/approvals',NULL,8111,3,false),
    ('property_approval:decide','房产业务审批决定','biz.property_approval','decide','api',40,'POST','/api/v1/property/approvals/:requestId/decisions',NULL,8112,3,false),
    ('property_approval:withdraw','房产业务审批撤回','biz.property_approval','withdraw','api',40,'POST','/api/v1/property/approvals/:requestId/withdraw',NULL,8113,3,false),
    ('property_approval:retry','审批执行重试','biz.property_approval_incident','retry','api',40,'POST','/api/v1/property/approvals/:requestId/retry','/property/approval-incidents',8114,3,false),
    ('property_approval:read_incident','审批事故读取','biz.property_approval_incident','read_incident','api',40,'GET','/api/v1/property/approval-incidents','/property/approval-incidents',8115,3,false),
    ('property_event:read_incident','事件投递事故读取','biz.property_event_dlq','read_incident','api',40,'GET','/api/v1/property/event-delivery-incidents','/property/event-delivery-incidents',8120,3,false),
    ('property_event:replay','事件投递重放','biz.property_event_dlq','replay','api',40,'POST','/api/v1/property/event-delivery-incidents/:dlqId/replay','/property/event-delivery-incidents',8121,3,false),
    ('property_task:read','房产业务任务读取','biz.property_task','read','api',40,'GET','/api/v1/property/tasks',NULL,8130,3,false),
    ('property_task:claim','房产业务任务领取','biz.property_task','claim','api',40,'POST','/api/v1/property/tasks/:taskId/claim',NULL,8131,3,false),
    ('property_task:process','房产业务任务处理','biz.property_task','process','api',40,'POST','/api/v1/property/tasks/:taskId/start',NULL,8132,3,false),
    ('property_task:release','房产业务任务释放','biz.property_task','release','api',40,'POST','/api/v1/property/tasks/:taskId/release',NULL,8133,3,false),
    ('property_task:supervise','房产业务任务督办','biz.property_task','supervise','api',40,'POST','/api/v1/property/tasks/:taskId/unblock',NULL,8134,3,false),
    ('property_task:rebuild','房产业务任务投影重建','biz.property_task_projection','rebuild','api',40,'POST','/api/v1/property/tasks/internal/rebuild',NULL,8135,3,false),
    ('property_notification:read','房产业务通知读取','biz.property_notification','read','api',40,'GET','/api/v1/property/notifications','/property/notifications',8140,3,false),
    ('property_notification:mark_read','房产业务通知标记已读','biz.property_notification','mark_read','api',40,'POST','/api/v1/property/notifications/:notificationId/read','/property/notifications',8141,3,false),
    ('asset:identity-submissions:page','身份核验工作台','asset.identity_submission','page','page',20,NULL,NULL,'/assets/identity-submissions',8201,2,true),
    ('asset:property-operations:page','共享房产控制面','asset.property_operation','page','page',20,NULL,NULL,'/assets/property-operations',8202,2,true),
    ('asset:property-occupancies:page','房产占用工作台','asset.property_occupancy','page','page',20,NULL,NULL,'/assets/property-occupancies',8203,2,true),
    ('asset:property-mode-transitions:page','房产模式变更审计','asset.property_mode_transition','page','page',20,NULL,NULL,'/assets/property-mode-transitions',8204,2,true),
    ('property:notifications:page','房产业务通知','property.notification','page','page',20,NULL,NULL,'/property/notifications',8210,2,true),
    ('property:event-delivery-incidents:page','事件投递事故处置','property.event_delivery_incident','page','page',20,NULL,NULL,'/property/event-delivery-incidents',8211,2,true),
    ('property:approval-incidents:page','审批执行事故处置','property.approval_incident','page','page',20,NULL,NULL,'/property/approval-incidents',8212,2,true)
)
INSERT INTO sys_permission (
  id, tenant_id, park_id, code, name, parent_id, resource, action,
  permission_path, perm_path, permission_level, level, sort_no,
  permission_type, perm_type, api_method, api_path, frontend_route,
  component_key, icon, field_key, data_dimension,
  is_system, is_builtin, is_tenant_custom, visible, keep_alive, always_show,
  is_enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  uuid_generate_v4(), scope.tenant_key, scope.park_key,
  permission.code, permission.name,
  CASE WHEN permission.parent_required THEN scope.parent_id ELSE NULL END,
  permission.resource, permission.action,
  CASE WHEN permission.permission_type='page' THEN 'asset/'||permission.code ELSE permission.code END,
  CASE WHEN permission.permission_type='page' THEN 'asset/'||permission.code ELSE permission.code END,
  permission.permission_level, permission.permission_level, permission.sort_no,
  permission.permission_type, permission.perm_type, permission.api_method,
  permission.api_path, permission.frontend_route,
  NULL,NULL,NULL,NULL,true,true,false,
  permission.permission_type='api',false,false,true,'enabled',
  clock_timestamp(),clock_timestamp(),false,1,'PR192 Track B frozen permission definition'
FROM permission_scope scope
CROSS JOIN signed_permission permission
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO NOTHING;

DO $$
DECLARE
  drift_count integer;
BEGIN
  WITH permission_scope AS (
    SELECT tenant_key,park_key FROM (
      SELECT scope.tenant_key,scope.park_key,
        row_number() OVER (
          PARTITION BY scope.tenant_key
          ORDER BY convert_to(scope.park_key,'UTF8')
        ) AS park_ordinal
      FROM b0_validated_business_target_scope scope
    ) ranked
    WHERE park_ordinal=1
  ),
  signed(code) AS (
    SELECT code FROM b0_signed_permission_code
  ),
  expected AS (
    SELECT scope.tenant_key,scope.park_key,signed.code
    FROM permission_scope scope CROSS JOIN signed
  ),
  actual AS (
    SELECT tenant_id,park_id,code
    FROM sys_permission
    WHERE remark='PR192 Track B frozen permission definition'
      AND is_enabled=true AND status='enabled' AND is_deleted=false
  ),
  drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT count(*) INTO drift_count FROM drift;
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'property-permission-definition-drift' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM sys_permission permission
    WHERE permission.is_deleted=false
      AND permission.code='property_occupancy:force_release'
      AND EXISTS (
        SELECT 1
        FROM b0_validated_business_target_scope scope
        WHERE scope.tenant_key=permission.tenant_id
      )
      AND permission.api_path IS DISTINCT FROM
        '/api/v1/property/occupancies/:occupancyId/release'
  ) THEN
    RAISE EXCEPTION 'property-permission-route-token-drift' USING ERRCODE='23514';
  END IF;
END;
$$;

DO $$
DECLARE
  invalid_scope_count integer;
BEGIN
  WITH target_scope AS (
    SELECT DISTINCT tenant_key
    FROM b0_validated_business_target_scope
  ),
  expected AS (
    SELECT count(DISTINCT permission_code) AS permission_count
    FROM b0_signed_bundle_member
  ),
  resolved AS (
    SELECT scope.tenant_key, count(DISTINCT permission.code) AS permission_count
    FROM target_scope scope
    LEFT JOIN b0_signed_bundle_member member ON true
    LEFT JOIN sys_permission permission
      ON permission.tenant_id=scope.tenant_key
     AND permission.code = member.permission_code
     AND permission.is_enabled = true
     AND permission.status = 'enabled'
     AND permission.is_deleted = false
    GROUP BY scope.tenant_key
  )
  SELECT count(*) INTO invalid_scope_count
  FROM resolved CROSS JOIN expected
  WHERE resolved.permission_count <> expected.permission_count;
  IF invalid_scope_count <> 0 THEN
    RAISE EXCEPTION 'property-bundle-permission-resolution-failed' USING ERRCODE = '23514';
  END IF;
END;
$$;




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
