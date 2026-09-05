BEGIN;

-- Optional Smart Park adapter, never part of the enterprise-only core or default migration chain.
CREATE UNIQUE INDEX uq_business_scope_tenant_kind_identity
  ON public.sys_business_scope (tenant_id, id, scope_kind);
CREATE UNIQUE INDEX uq_biz_park_row_scope_identity
  ON public.biz_park (id, tenant_id, park_id);

CREATE TABLE public.sys_business_scope_park_binding (
  tenant_id varchar(64) NOT NULL,
  scope_id uuid NOT NULL,
  scope_kind varchar(16) NOT NULL DEFAULT 'park' CHECK (scope_kind = 'park'),
  park_row_id uuid NOT NULL,
  park_id varchar(64) NOT NULL CHECK (park_id <> '' AND park_id = btrim(park_id)),
  create_time timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope_id),
  UNIQUE (tenant_id, park_id),
  FOREIGN KEY (tenant_id, scope_id, scope_kind)
    REFERENCES public.sys_business_scope (tenant_id, id, scope_kind),
  FOREIGN KEY (park_row_id, tenant_id, park_id)
    REFERENCES public.biz_park (id, tenant_id, park_id)
);

-- Explicit owner-only, tenant-bounded preparation; never grants membership, modules or RBAC.
CREATE FUNCTION public.backfill_smart_park_business_scopes(requested_tenant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tenant_row uuid;
  source_row record;
  binding_row record;
  new_scope uuid;
  source_count integer := 0;
  created_count integer := 0;
BEGIN
  IF requested_tenant_id IS NULL OR requested_tenant_id = ''
     OR requested_tenant_id <> btrim(requested_tenant_id)
     OR length(requested_tenant_id) > 64 THEN
    RAISE EXCEPTION 'SMART_PARK_SCOPE_INVALID_TENANT';
  END IF;
  LOCK TABLE public.sys_tenant, public.biz_park, public.sys_business_scope,
    public.sys_business_scope_park_binding IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM public.sys_tenant
      WHERE tenant_id = requested_tenant_id AND is_deleted = false) <> 1 THEN
    RAISE EXCEPTION 'SMART_PARK_SCOPE_TENANT_NOT_UNIQUE';
  END IF;
  SELECT id INTO tenant_row FROM public.sys_tenant
    WHERE tenant_id = requested_tenant_id AND is_deleted = false;
  IF EXISTS (
    SELECT park_id FROM public.biz_park
    WHERE tenant_id = requested_tenant_id AND is_deleted = false
    GROUP BY park_id HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'SMART_PARK_SCOPE_SOURCE_AMBIGUOUS';
  END IF;

  FOR source_row IN
    SELECT id, park_id, park_name, status FROM public.biz_park
    WHERE tenant_id = requested_tenant_id AND is_deleted = false ORDER BY park_id
  LOOP
    source_count := source_count + 1;
    SELECT binding.park_row_id, scope.tenant_row_id, scope.is_deleted, scope.scope_kind
      INTO binding_row
      FROM public.sys_business_scope_park_binding binding
      JOIN public.sys_business_scope scope
        ON scope.tenant_id = binding.tenant_id AND scope.id = binding.scope_id
      WHERE binding.tenant_id = requested_tenant_id AND binding.park_id = source_row.park_id;
    IF FOUND THEN
      IF binding_row.park_row_id <> source_row.id OR binding_row.tenant_row_id <> tenant_row
         OR binding_row.is_deleted OR binding_row.scope_kind <> 'park' THEN
        RAISE EXCEPTION 'SMART_PARK_SCOPE_BINDING_DRIFT';
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.sys_business_scope
      (tenant_row_id, tenant_id, scope_kind, scope_code, scope_name, status)
    VALUES (tenant_row, requested_tenant_id, 'park',
      'park:' || md5(jsonb_build_array(requested_tenant_id, source_row.park_id)::text),
      source_row.park_name, CASE WHEN source_row.status = 1 THEN 'enabled' ELSE 'disabled' END)
    RETURNING id INTO new_scope;
    INSERT INTO public.sys_business_scope_park_binding
      (tenant_id, scope_id, park_row_id, park_id)
    VALUES (requested_tenant_id, new_scope, source_row.id, source_row.park_id);
    created_count := created_count + 1;
  END LOOP;
  RETURN jsonb_build_object('sourceParks', source_count, 'createdScopes', created_count,
    'createdBindings', created_count, 'existingBindings', source_count - created_count);
END $$;

REVOKE ALL ON FUNCTION public.backfill_smart_park_business_scopes(text) FROM PUBLIC;
COMMIT;
