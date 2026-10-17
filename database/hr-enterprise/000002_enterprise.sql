BEGIN;
ALTER TABLE sys_business_scope ADD CONSTRAINT ck_hr_enterprise_kind CHECK(scope_kind='enterprise');
ALTER TABLE sys_business_scope ADD COLUMN scope_key varchar(64) GENERATED ALWAYS AS(replace(id::text,'-','')) STORED;
ALTER TABLE sys_business_scope ADD CONSTRAINT uq_hr_enterprise_scope_key UNIQUE(tenant_id,scope_key);
CREATE TABLE sys_hr_runtime_schema(runtime_mode text PRIMARY KEY CHECK(runtime_mode='hr_enterprise'),schema_version integer NOT NULL CHECK(schema_version=1),installed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO sys_hr_runtime_schema(runtime_mode,schema_version) VALUES('hr_enterprise',1);
-- The legacy column names retain one exact enterprise identity, never a park row.
DO $$DECLARE relation record;BEGIN
 FOR relation IN SELECT c.table_name FROM information_schema.columns c WHERE c.table_schema='public' AND c.column_name='park_id' AND c.data_type='character varying' AND(c.table_name LIKE 'hr_%' OR c.table_name IN('sys_user','sys_role','rel_user_role','rel_role_perm','sys_org','sys_post','rel_user_org','sys_file','sys_op_log','sys_login_log','sys_idempotency_request','biz_user_message')) AND EXISTS(SELECT 1 FROM information_schema.columns t WHERE(t.table_schema,t.table_name,t.column_name)=(c.table_schema,c.table_name,'tenant_id')) LOOP
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT fk_hr_enterprise_scope FOREIGN KEY(tenant_id,park_id) REFERENCES public.sys_business_scope(tenant_id,scope_key)',relation.table_name);
 END LOOP;
END$$;
CREATE FUNCTION hr_enterprise_actor_scope_live(t varchar,p varchar,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.sys_business_scope s JOIN public.sys_tenant tenant ON(tenant.id,tenant.tenant_id)=(s.tenant_row_id,s.tenant_id) JOIN public.sys_user_business_scope_membership m ON(m.tenant_id,m.scope_id)=(s.tenant_id,s.id) WHERE s.tenant_id=t AND s.scope_key=p AND s.scope_kind='enterprise' AND s.status='enabled' AND NOT s.is_deleted AND NOT tenant.is_deleted AND tenant.status=1 AND(tenant.expire_time IS NULL OR tenant.expire_time>now()) AND m.user_id=u AND m.status='enabled' AND NOT m.is_deleted)
$$;
-- Existing permission evaluator's RBAC predicates are retained verbatim; add only live enterprise membership.
CREATE OR REPLACE FUNCTION hr_performance_channel_actor_has(t varchar,p varchar,u uuid,permission_code text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT public.hr_enterprise_actor_scope_live(t,p,u) AND EXISTS(SELECT 1 FROM public.sys_user actor JOIN public.rel_user_role ur ON(ur.user_id,ur.tenant_id)=(actor.id,actor.tenant_id)
 JOIN public.sys_role r ON(r.id,r.tenant_id)=(ur.role_id,ur.tenant_id)
 LEFT JOIN public.rel_role_perm rp ON(rp.role_id,rp.tenant_id,rp.park_id)=(r.id,ur.tenant_id,p) AND NOT rp.is_deleted
 LEFT JOIN public.sys_permission perm ON(perm.id,perm.tenant_id)=(rp.permission_id,rp.tenant_id) AND NOT perm.is_deleted AND perm.is_enabled AND perm.status='enabled'
 WHERE actor.tenant_id=t AND actor.id=u AND actor.is_enabled AND NOT actor.is_deleted AND actor.status='enabled' AND NOT ur.is_deleted AND NOT r.is_deleted AND r.is_enabled AND r.status='enabled'
 AND ((r.code='SUPER_ADMIN' AND r.role_scope='platform' AND r.is_super AND r.is_system AND r.is_builtin)
 OR (ur.park_id=p AND(r.role_scope='tenant' OR r.park_id=p) AND(r.is_super OR permission_code IS NULL OR perm.code IN(permission_code,'*')))))
$$;
COMMIT;
