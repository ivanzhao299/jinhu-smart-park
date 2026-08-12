-- Production-safe reconciliation for the PR262 property-business standard
-- role templates. Templates are not user-assignable roles; administrators
-- instantiate ordinary current-park roles from them through the Roles API.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtextextended(current_database() || ':property-role-template-reconcile:10000001:20000001', 0)
);

CREATE TEMP TABLE property_role_template_scope (
  tenant_id varchar(64) PRIMARY KEY,
  park_id varchar(64) NOT NULL
) ON COMMIT DROP;

INSERT INTO property_role_template_scope VALUES ('10000001', '20000001');

UPDATE sys_permission permission
SET visible = permission.permission_type = 'page',
    update_time = clock_timestamp(),
    version = permission.version + 1
FROM property_role_template_scope scope
WHERE permission.tenant_id = scope.tenant_id
  AND permission.remark = 'PR192 Track B frozen permission definition'
  AND permission.permission_type IN ('page','api')
  AND permission.perm_type = CASE permission.permission_type WHEN 'page' THEN 20 ELSE 40 END
  AND permission.is_deleted = false
  AND permission.visible IS DISTINCT FROM (permission.permission_type = 'page');

DO $$
DECLARE
  visible_definition_count integer;
  visible_drift_count integer;
BEGIN
  SELECT count(*),count(*) FILTER (
    WHERE permission.visible IS DISTINCT FROM (permission.permission_type='page')
  ) INTO visible_definition_count,visible_drift_count
  FROM property_role_template_scope scope
  JOIN sys_permission permission ON permission.tenant_id=scope.tenant_id
    AND permission.remark='PR192 Track B frozen permission definition'
    AND permission.permission_type IN ('page','api')
    AND permission.is_deleted=false;

  IF visible_definition_count<>25 OR visible_drift_count<>0 THEN
    RAISE EXCEPTION 'property-track-b-visible-seed-drift: definitions=%, drift=%',
      visible_definition_count,visible_drift_count USING ERRCODE='23514';
  END IF;
END $$;

CREATE TEMP TABLE property_role_template_expected (
  template_code varchar(64) PRIMARY KEY,
  template_name varchar(100) NOT NULL,
  definition_version integer NOT NULL,
  definition_hash char(64) NOT NULL,
  bundle_signature char(64) NOT NULL,
  sort_no integer NOT NULL
) ON COMMIT DROP;

INSERT INTO property_role_template_expected VALUES
  ('PROPERTY_OPERATIONS_MANAGER','房源经营管理员',1,'b99a427b74a2a08e256c9c6c76946df063813ab68458e60e67b2d8fbbc0b0b9e','5f195e6283ebe78e869a51ac75a793b86bb57d02c78b9b698f4cb2ee1e1c1cfd',301),
  ('PROPERTY_OPERATIONS_APPROVER','房源经营审批人',1,'ec8371f75e168bb260873f135d9ab1677123714770cff7ccea83e115a8015102','9bb64e651981515dfbca11fc3d495f3eb4f01551fee54cfd2807b9eadba96972',302),
  ('HOMESTAY_OPERATOR','民宿经办',1,'c534047821ae825a4104503ae6d5c8df2da625199b6a2471b545c230aba67267','0f18c9719cf6df9342d1d4c83a87e33283b58ebcc7fca485952250b6c7733ad0',303),
  ('HOUSING_OPERATOR','住房经办',1,'c5e76001d2a51adffda88b4f5138e5a68c1c7ba032822498decc6430a65ece95','573d8cce9080e97d80f196a634cd342efd8acd5f812d8de56f0abb87e0b0d4c8',304),
  ('HOMESTAY_FINANCE','民宿财务',1,'8bd6a8a04c21835375164f72dcb2cfd808ecabfc64b4ff409745c3806fdc8a05','91e7c40677d9a26926e8d5e951631c3a5149786b6d361fa7f2f82408804a93a5',305),
  ('HOUSING_FINANCE','住房财务',1,'de2cc04dedcb6416ae1ffba66f6e81d15774344dcf7b20538f9047e8d80e2f1d','4001bbd2fe4dc2b552ff493eedc141556ac107e56998e4e2c35e258c4675b593',306),
  ('PROPERTY_AUDITOR','房产业务审计',1,'30b072e062cfd05e72b89deb17238ed01fd31685d0077eb706d80b6a5c46f05b','abb2423994d193a4aff04b91cf7808bbd38dab15769733c5cbd6b6f3afd5a9d0',307);

CREATE TEMP TABLE property_role_template_allowed_predecessor (
  template_code varchar(64) NOT NULL,
  definition_version integer NOT NULL,
  definition_hash char(64) NOT NULL,
  bundle_signature char(64) NOT NULL,
  PRIMARY KEY (template_code,definition_version,definition_hash,bundle_signature)
) ON COMMIT DROP;

-- A future forward seed must enumerate each released predecessor before
-- advancing the expected definition. Unknown metadata drift remains fail-closed.

CREATE TEMP TABLE property_role_template_bundle (
  template_code varchar(64) NOT NULL,
  bundle_code varchar(128) NOT NULL,
  definition_version integer NOT NULL,
  definition_hash char(64) NOT NULL,
  PRIMARY KEY (template_code, bundle_code)
) ON COMMIT DROP;

INSERT INTO property_role_template_bundle VALUES
  ('PROPERTY_OPERATIONS_MANAGER','property-bundle:property-asset-manager',2,'171bd526f60587378ee5ff944a84402964e299d683058526ad3f07f973394be7'),
  ('PROPERTY_OPERATIONS_APPROVER','property-bundle:property-homestay-approver',1,'a332f427d5ebd7aab985041c72ba9e26ddd85b53647b00394e5d346c3167ea3c'),
  ('PROPERTY_OPERATIONS_APPROVER','property-bundle:property-housing-approver',1,'ebc48ebd63433714db7049f69135f4296d3ef94be98b94e07e3ee37cea0725ff'),
  ('HOMESTAY_OPERATOR','property-bundle:property-homestay-task-operator',1,'07dfe5888e0928b439839b28c707bd9f1d557587714dfe473ece846205c3d425'),
  ('HOUSING_OPERATOR','property-bundle:property-housing-operator',1,'25ff2287f99d3c8c3f1db67a6f6ec28bbbed7bbc85cbc014617ffe287df30f33'),
  ('HOMESTAY_FINANCE','property-bundle:property-homestay-finance-operator',1,'a45cbf14acba5b7eacd82232ed33541746d96dfe1a16207d776a2ec89c0ee58b'),
  ('HOUSING_FINANCE','property-bundle:property-housing-finance-operator',1,'08ad4214fe579d92203a2bae75e55c0257c40d391947ce11c9db9ba313d552ef'),
  ('PROPERTY_AUDITOR','property-bundle:property-auditor',1,'e54977e87bff8b36ff06bd2532da7d462fc76657cc3534e77831f39074fffa24');

CREATE TEMP TABLE property_role_template_additional_permission (
  template_code varchar(64) NOT NULL,
  permission_code varchar(128) NOT NULL,
  PRIMARY KEY (template_code, permission_code)
) ON COMMIT DROP;

INSERT INTO property_role_template_additional_permission VALUES
  ('PROPERTY_OPERATIONS_APPROVER','asset:property-operations:page'),
  ('PROPERTY_OPERATIONS_APPROVER','asset:property-occupancies:page'),
  ('PROPERTY_OPERATIONS_APPROVER','asset:property-mode-transitions:page'),
  ('PROPERTY_OPERATIONS_APPROVER','property_operation:read'),
  ('PROPERTY_OPERATIONS_APPROVER','property_occupancy:read'),
  ('HOMESTAY_OPERATOR','property_approval:create'),
  ('HOMESTAY_OPERATOR','property_approval:read'),
  ('HOMESTAY_OPERATOR','property_approval:withdraw'),
  ('PROPERTY_AUDITOR','property_operation:read'),
  ('PROPERTY_AUDITOR','property_occupancy:read');

CREATE TEMP TABLE property_role_template_excluded_permission (
  template_code varchar(64) NOT NULL,
  permission_code varchar(128) NOT NULL,
  PRIMARY KEY (template_code, permission_code)
) ON COMMIT DROP;

INSERT INTO property_role_template_excluded_permission VALUES
  ('PROPERTY_OPERATIONS_MANAGER','property_approval:decide'),
  ('PROPERTY_OPERATIONS_APPROVER','property_approval:create'),
  ('PROPERTY_OPERATIONS_APPROVER','property_approval:withdraw'),
  ('PROPERTY_OPERATIONS_APPROVER','property_operation:update'),
  ('PROPERTY_OPERATIONS_APPROVER','property_operation:transition_mode'),
  ('PROPERTY_OPERATIONS_APPROVER','property_occupancy:create'),
  ('PROPERTY_OPERATIONS_APPROVER','property_occupancy:activate'),
  ('PROPERTY_OPERATIONS_APPROVER','property_occupancy:release'),
  ('PROPERTY_OPERATIONS_APPROVER','property_occupancy:force_release'),
  ('HOMESTAY_OPERATOR','property_approval:decide'),
  ('HOUSING_OPERATOR','property_approval:decide'),
  ('HOMESTAY_FINANCE','property_approval:decide'),
  ('HOMESTAY_FINANCE','party:sensitive_read'),
  ('HOUSING_FINANCE','property_approval:decide'),
  ('HOUSING_FINANCE','party:sensitive_read'),
  ('PROPERTY_AUDITOR','party:sensitive_read');

DO $$
DECLARE
  tenant_count integer;
  park_count integer;
  scope_rule_count integer;
  bundle_drift_count integer;
  conflicting_role_count integer;
BEGIN
  SELECT count(*) INTO tenant_count
  FROM property_role_template_scope scope
  JOIN sys_tenant tenant ON tenant.tenant_id=scope.tenant_id
    AND tenant.status=1 AND tenant.is_deleted=false
    AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp());

  SELECT count(*) INTO park_count
  FROM property_role_template_scope scope
  JOIN biz_park park ON park.tenant_id=scope.tenant_id AND park.park_id=scope.park_id
    AND park.status=1 AND park.is_deleted=false;

  SELECT count(*) INTO scope_rule_count
  FROM property_role_template_scope scope
  JOIN sys_data_scope_rule rule ON rule.tenant_id=scope.tenant_id
    AND rule.park_id=scope.park_id AND rule.rule_code='current_park'
    AND rule.dimension='park' AND rule.scope_type='park'
    AND rule.status='enabled' AND rule.is_deleted=false;

  SELECT count(*) INTO bundle_drift_count
  FROM property_role_template_bundle expected
  LEFT JOIN (
    SELECT bundle.id,bundle.bundle_code,bundle.bundle_name,bundle.definition_version,
      bundle.definition_hash,bundle.status,bundle.is_deleted,
      encode(digest(convert_to(
        'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
        || bundle.bundle_name || chr(10)
        || string_agg(lpad(member.member_ordinal::text,4,'0') || chr(9)
             || member.permission_code || chr(10), '' ORDER BY member.member_ordinal),
        'UTF8'), 'sha256'), 'hex') AS actual_hash
    FROM sys_property_permission_bundle bundle
    JOIN rel_property_permission_bundle_member member
      ON member.bundle_id=bundle.id AND member.is_deleted=false
    GROUP BY bundle.id,bundle.bundle_code,bundle.bundle_name,bundle.definition_version,
      bundle.definition_hash,bundle.status,bundle.is_deleted
  ) bundle
    ON bundle.bundle_code=expected.bundle_code
   AND bundle.definition_version=expected.definition_version
   AND bundle.definition_hash=expected.definition_hash
   AND bundle.actual_hash=expected.definition_hash
   AND bundle.status='enabled' AND bundle.is_deleted=false
  WHERE bundle.id IS NULL;

  SELECT count(*) INTO conflicting_role_count
  FROM property_role_template_scope scope
  JOIN sys_role role ON role.tenant_id=scope.tenant_id
    AND role.code IN (SELECT template_code FROM property_role_template_expected)
    AND role.is_deleted=false
  JOIN property_role_template_expected expected ON expected.template_code=role.code
  WHERE role.park_id<>scope.park_id
     OR role.managed_template_code IS DISTINCT FROM role.code
     OR role.is_template IS DISTINCT FROM true
     OR role.is_system IS DISTINCT FROM true
     OR role.is_builtin IS DISTINCT FROM true
     OR role.is_super IS DISTINCT FROM false
     OR NOT (
       (role.template_definition_version=expected.definition_version
        AND role.template_definition_hash=expected.definition_hash
        AND role.applied_bundle_signature=expected.bundle_signature)
       OR EXISTS (
         SELECT 1 FROM property_role_template_allowed_predecessor predecessor
         WHERE predecessor.template_code=role.code
           AND predecessor.definition_version=role.template_definition_version
           AND predecessor.definition_hash=role.template_definition_hash
           AND predecessor.bundle_signature=role.applied_bundle_signature
       )
     );

  IF tenant_count<>1 OR park_count<>1 OR scope_rule_count<>1
     OR bundle_drift_count<>0 OR conflicting_role_count<>0 THEN
    RAISE EXCEPTION
      'property-role-template-preflight-failed: tenant=%, park=%, scope_rule=%, bundle_drift=%, role_conflict=%',
      tenant_count,park_count,scope_rule_count,bundle_drift_count,conflicting_role_count
      USING ERRCODE='23514';
  END IF;
END $$;

INSERT INTO sys_role (
  id,tenant_id,park_id,code,name,parent_id,role_path,role_level,level,sort_no,
  role_type,role_scope,data_scope,data_scope_config,is_template,is_system,is_builtin,
  is_super,editable,is_editable,is_deletable,is_enabled,status,
  managed_template_code,template_definition_version,template_definition_hash,
  applied_bundle_codes,applied_bundle_signature,create_time,update_time,is_deleted,version,remark
)
SELECT uuid_generate_v4(),scope.tenant_id,scope.park_id,expected.template_code,
  expected.template_name,NULL,expected.template_code,1,1,expected.sort_no,
  'property_template','park','40','{}'::jsonb,true,true,true,false,
  false,false,false,true,'enabled',expected.template_code,
  expected.definition_version,expected.definition_hash,
  COALESCE((SELECT jsonb_agg(bundle_code ORDER BY bundle_code)
    FROM property_role_template_bundle b WHERE b.template_code=expected.template_code),'[]'::jsonb),
  expected.bundle_signature,clock_timestamp(),clock_timestamp(),false,1,
  'PR262 managed property-business role template'
FROM property_role_template_scope scope
CROSS JOIN property_role_template_expected expected
ON CONFLICT (tenant_id,code) WHERE is_deleted=false DO UPDATE SET
  name=EXCLUDED.name,park_id=EXCLUDED.park_id,role_path=EXCLUDED.role_path,
  sort_no=EXCLUDED.sort_no,role_type=EXCLUDED.role_type,role_scope='park',data_scope='40',
  data_scope_config='{}'::jsonb,is_template=true,is_system=true,is_builtin=true,is_super=false,
  editable=false,is_editable=false,is_deletable=false,is_enabled=true,status='enabled',
  managed_template_code=EXCLUDED.managed_template_code,
  template_definition_version=EXCLUDED.template_definition_version,
  template_definition_hash=EXCLUDED.template_definition_hash,
  applied_bundle_codes=EXCLUDED.applied_bundle_codes,
  applied_bundle_signature=EXCLUDED.applied_bundle_signature,
  update_time=clock_timestamp(),version=sys_role.version+1,remark=EXCLUDED.remark
WHERE (sys_role.name,sys_role.park_id,sys_role.role_path,sys_role.sort_no,
       sys_role.role_type,sys_role.role_scope,sys_role.data_scope,sys_role.data_scope_config,
       sys_role.is_template,sys_role.is_system,sys_role.is_builtin,sys_role.is_super,
       sys_role.editable,sys_role.is_editable,sys_role.is_deletable,sys_role.is_enabled,
       sys_role.status,sys_role.managed_template_code,sys_role.template_definition_version,
       sys_role.template_definition_hash,sys_role.applied_bundle_codes,
       sys_role.applied_bundle_signature,sys_role.remark)
  IS DISTINCT FROM
      (EXCLUDED.name,EXCLUDED.park_id,EXCLUDED.role_path,EXCLUDED.sort_no,
       EXCLUDED.role_type,'park','40','{}'::jsonb,true,true,true,false,
       false,false,false,true,'enabled',EXCLUDED.managed_template_code,
       EXCLUDED.template_definition_version,EXCLUDED.template_definition_hash,
       EXCLUDED.applied_bundle_codes,EXCLUDED.applied_bundle_signature,EXCLUDED.remark);

CREATE TEMP TABLE property_role_template_permission ON COMMIT DROP AS
SELECT DISTINCT expected.template_code,member.permission_code
FROM property_role_template_expected expected
JOIN property_role_template_bundle mapping ON mapping.template_code=expected.template_code
JOIN sys_property_permission_bundle bundle ON bundle.bundle_code=mapping.bundle_code
  AND bundle.definition_version=mapping.definition_version
  AND bundle.definition_hash=mapping.definition_hash
  AND bundle.status='enabled' AND bundle.is_deleted=false
JOIN rel_property_permission_bundle_member member ON member.bundle_id=bundle.id
  AND member.is_deleted=false
WHERE NOT EXISTS (
  SELECT 1 FROM property_role_template_excluded_permission excluded
  WHERE excluded.template_code=expected.template_code
    AND excluded.permission_code=member.permission_code
)
UNION
SELECT template_code,permission_code FROM property_role_template_additional_permission;

DO $$
DECLARE
  unresolved_count integer;
  forbidden_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM property_role_template_permission expected
  CROSS JOIN property_role_template_scope scope
  LEFT JOIN sys_permission permission ON permission.tenant_id=scope.tenant_id
    AND permission.code=expected.permission_code
    AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
  WHERE permission.id IS NULL;

  SELECT count(*) INTO forbidden_count
  FROM property_role_template_permission
  WHERE permission_code='party:sensitive_read'
     OR (template_code<>'PROPERTY_OPERATIONS_APPROVER' AND permission_code='property_approval:decide')
     OR (template_code='PROPERTY_OPERATIONS_APPROVER' AND permission_code IN (
       'property_approval:create','property_approval:withdraw','property_operation:update',
       'property_operation:transition_mode','property_occupancy:create','property_occupancy:activate',
       'property_occupancy:release','property_occupancy:force_release'
     ));

  IF unresolved_count<>0 OR forbidden_count<>0 THEN
    RAISE EXCEPTION 'property-role-template-permission-preflight-failed: unresolved=%, forbidden=%',
      unresolved_count,forbidden_count USING ERRCODE='23514';
  END IF;
END $$;

UPDATE rel_role_perm link
SET is_deleted=true,update_time=clock_timestamp(),version=link.version+1,
    remark='PR262 superseded managed template permission'
FROM property_role_template_scope scope
JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
  AND role.managed_template_code=role.code AND role.is_template=true
  AND role.code IN (SELECT template_code FROM property_role_template_expected)
  AND role.is_deleted=false
CROSS JOIN sys_permission permission
WHERE link.tenant_id=scope.tenant_id AND link.park_id=scope.park_id
  AND link.role_id=role.id AND link.is_deleted=false
  AND permission.id=link.permission_id
  AND NOT EXISTS (
    SELECT 1 FROM property_role_template_permission expected
    WHERE expected.template_code=role.code AND expected.permission_code=permission.code
      AND permission.tenant_id=scope.tenant_id
      AND permission.is_deleted=false AND permission.is_enabled=true AND permission.status='enabled'
  );

INSERT INTO rel_role_perm (
  tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark
)
SELECT scope.tenant_id,scope.park_id,role.id,permission.id,
  clock_timestamp(),clock_timestamp(),false,1,'PR262 managed template permission'
FROM property_role_template_scope scope
JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
  AND role.code IN (SELECT template_code FROM property_role_template_expected)
  AND role.managed_template_code=role.code AND role.is_template=true AND role.is_deleted=false
JOIN property_role_template_permission expected ON expected.template_code=role.code
JOIN sys_permission permission ON permission.tenant_id=scope.tenant_id
  AND permission.code=expected.permission_code AND permission.is_enabled=true
  AND permission.status='enabled' AND permission.is_deleted=false
ON CONFLICT (tenant_id,park_id,role_id,permission_id) WHERE is_deleted=false DO UPDATE SET
  is_deleted=false,update_time=clock_timestamp(),remark=EXCLUDED.remark
WHERE rel_role_perm.remark IS DISTINCT FROM EXCLUDED.remark;

INSERT INTO rel_role_data_scope (
  tenant_id,park_id,role_id,rule_id,create_time,update_time,is_deleted,version,remark
)
SELECT scope.tenant_id,scope.park_id,role.id,rule.id,
  clock_timestamp(),clock_timestamp(),false,1,'PR262 managed template current_park scope'
FROM property_role_template_scope scope
JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
  AND role.code IN (SELECT template_code FROM property_role_template_expected)
  AND role.managed_template_code=role.code AND role.is_template=true AND role.is_deleted=false
JOIN sys_data_scope_rule rule ON rule.tenant_id=scope.tenant_id AND rule.park_id=scope.park_id
  AND rule.rule_code='current_park' AND rule.status='enabled' AND rule.is_deleted=false
ON CONFLICT (tenant_id,park_id,role_id,rule_id) WHERE is_deleted=false DO UPDATE SET
  is_deleted=false,update_time=clock_timestamp(),remark=EXCLUDED.remark
WHERE rel_role_data_scope.remark IS DISTINCT FROM EXCLUDED.remark;

UPDATE rel_role_data_scope link
SET is_deleted=true,update_time=clock_timestamp(),version=link.version+1,
    remark='PR262 superseded managed template data scope'
FROM property_role_template_scope scope
JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
  AND role.code IN (SELECT template_code FROM property_role_template_expected)
  AND role.managed_template_code=role.code AND role.is_template=true AND role.is_deleted=false
WHERE link.tenant_id=scope.tenant_id AND link.park_id=scope.park_id
  AND link.role_id=role.id AND link.is_deleted=false
  AND NOT EXISTS (
    SELECT 1 FROM sys_data_scope_rule rule
    WHERE rule.id=link.rule_id AND rule.tenant_id=scope.tenant_id
      AND rule.park_id=scope.park_id AND rule.rule_code='current_park'
      AND rule.dimension='park' AND rule.scope_type='park'
      AND rule.status='enabled' AND rule.is_deleted=false
  );

DO $$
DECLARE
  role_count integer;
  scope_count integer;
  scope_drift_count integer;
  permission_drift_count integer;
BEGIN
  SELECT count(*) INTO role_count
  FROM property_role_template_scope scope
  JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
    AND role.code IN (SELECT template_code FROM property_role_template_expected)
    AND role.managed_template_code=role.code AND role.is_template=true
    AND role.is_system=true AND role.is_builtin=true AND role.is_super=false
    AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false;

  SELECT count(*),count(*) FILTER (
    WHERE rule.rule_code IS DISTINCT FROM 'current_park'
       OR rule.dimension IS DISTINCT FROM 'park'
       OR rule.scope_type IS DISTINCT FROM 'park'
       OR rule.status IS DISTINCT FROM 'enabled'
       OR rule.is_deleted IS DISTINCT FROM false
  ) INTO scope_count,scope_drift_count
  FROM property_role_template_scope scope
  JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
    AND role.code IN (SELECT template_code FROM property_role_template_expected)
    AND role.is_deleted=false
  JOIN rel_role_data_scope link ON link.tenant_id=scope.tenant_id AND link.park_id=scope.park_id
    AND link.role_id=role.id AND link.is_deleted=false
  LEFT JOIN sys_data_scope_rule rule ON rule.id=link.rule_id;

  WITH actual AS (
    SELECT role.code AS template_code,
      CASE WHEN permission.tenant_id=scope.tenant_id THEN permission.code ELSE '__cross_tenant__:' || permission.id::text END AS permission_code
    FROM property_role_template_scope scope
    JOIN sys_role role ON role.tenant_id=scope.tenant_id AND role.park_id=scope.park_id
      AND role.code IN (SELECT template_code FROM property_role_template_expected)
      AND role.is_deleted=false
    JOIN rel_role_perm link ON link.tenant_id=scope.tenant_id AND link.park_id=scope.park_id
      AND link.role_id=role.id AND link.is_deleted=false
    JOIN sys_permission permission ON permission.id=link.permission_id AND permission.is_deleted=false
  ), drift AS (
    (SELECT * FROM property_role_template_permission EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM property_role_template_permission)
  ) SELECT count(*) INTO permission_drift_count FROM drift;

  IF role_count<>7 OR scope_count<>7 OR scope_drift_count<>0 OR permission_drift_count<>0 THEN
    RAISE EXCEPTION 'property-role-template-reconcile-incomplete: roles=%, scopes=%, scope_drift=%, permission_drift=%',
      role_count,scope_count,scope_drift_count,permission_drift_count USING ERRCODE='23514';
  END IF;
END $$;

COMMIT;
