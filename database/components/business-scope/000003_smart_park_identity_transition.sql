BEGIN;

-- Optional Smart Park stage-1 identity transition. This component is additive:
-- legacy park columns and uniqueness remain authoritative until a later cutover.
DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'public.sys_tenant',
    'public.biz_park',
    'public.sys_business_scope',
    'public.sys_business_scope_park_binding',
    'public.sys_user',
    'public.sys_role',
    'public.sys_permission',
    'public.rel_user_role',
    'public.rel_role_perm',
    'public.sys_user_identity',
    'public.sys_auth_refresh_token'
  ]
  LOOP
    IF to_regclass(required_table) IS NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = 'SMART_PARK_IDENTITY_TRANSITION_PREREQUISITE_MISSING',
        ERRCODE = 'P0001';
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.sys_user
  ADD COLUMN default_scope_id uuid;
ALTER TABLE public.sys_role
  ADD COLUMN scope_id uuid;
ALTER TABLE public.rel_user_role
  ADD COLUMN scope_id uuid;
ALTER TABLE public.rel_role_perm
  ADD COLUMN scope_id uuid;
ALTER TABLE public.sys_auth_refresh_token
  ADD COLUMN scope_id uuid;

-- These identities support tenant-qualified references without changing the
-- existing tenant-wide role/permission definition model.
CREATE UNIQUE INDEX uq_sys_role_row_tenant_identity
  ON public.sys_role (id, tenant_id);
CREATE UNIQUE INDEX uq_sys_permission_row_tenant_identity
  ON public.sys_permission (id, tenant_id);
CREATE UNIQUE INDEX uq_business_scope_park_binding_exact_identity
  ON public.sys_business_scope_park_binding (tenant_id, scope_id, park_id);

ALTER TABLE public.sys_user
  ADD CONSTRAINT fk_sys_user_default_scope_park_binding
  FOREIGN KEY (tenant_id, default_scope_id, park_id)
  REFERENCES public.sys_business_scope_park_binding (tenant_id, scope_id, park_id);

ALTER TABLE public.sys_role
  ADD CONSTRAINT ck_sys_role_transition_scope_kind
  CHECK (
    role_scope IN ('tenant', 'park', 'platform')
    AND (scope_id IS NULL OR role_scope = 'park')
  ),
  ADD CONSTRAINT fk_sys_role_scope_park_binding
  FOREIGN KEY (tenant_id, scope_id, park_id)
  REFERENCES public.sys_business_scope_park_binding (tenant_id, scope_id, park_id),
  ADD CONSTRAINT fk_sys_role_parent_tenant_identity
  FOREIGN KEY (parent_id, tenant_id)
  REFERENCES public.sys_role (id, tenant_id);

ALTER TABLE public.sys_permission
  ADD CONSTRAINT fk_sys_permission_parent_tenant_identity
  FOREIGN KEY (parent_id, tenant_id)
  REFERENCES public.sys_permission (id, tenant_id);

ALTER TABLE public.rel_user_role
  ADD CONSTRAINT fk_rel_user_role_user_tenant_identity
  FOREIGN KEY (user_id, tenant_id)
  REFERENCES public.sys_user (id, tenant_id),
  ADD CONSTRAINT fk_rel_user_role_role_tenant_identity
  FOREIGN KEY (role_id, tenant_id)
  REFERENCES public.sys_role (id, tenant_id),
  ADD CONSTRAINT fk_rel_user_role_scope_park_binding
  FOREIGN KEY (tenant_id, scope_id, park_id)
  REFERENCES public.sys_business_scope_park_binding (tenant_id, scope_id, park_id);

ALTER TABLE public.rel_role_perm
  ADD CONSTRAINT fk_rel_role_perm_role_tenant_identity
  FOREIGN KEY (role_id, tenant_id)
  REFERENCES public.sys_role (id, tenant_id),
  ADD CONSTRAINT fk_rel_role_perm_permission_tenant_identity
  FOREIGN KEY (permission_id, tenant_id)
  REFERENCES public.sys_permission (id, tenant_id),
  ADD CONSTRAINT fk_rel_role_perm_scope_park_binding
  FOREIGN KEY (tenant_id, scope_id, park_id)
  REFERENCES public.sys_business_scope_park_binding (tenant_id, scope_id, park_id);

-- Provider identities remain tenant identities. The composite FK closes the
-- historical cross-tenant hole without cloning identities per business scope.
ALTER TABLE public.sys_user_identity
  ADD CONSTRAINT fk_sys_user_identity_user_tenant_identity
  FOREIGN KEY (user_id, tenant_id)
  REFERENCES public.sys_user (id, tenant_id);

ALTER TABLE public.sys_auth_refresh_token
  ADD CONSTRAINT fk_sys_auth_refresh_token_user_tenant_identity
  FOREIGN KEY (user_id, tenant_id)
  REFERENCES public.sys_user (id, tenant_id),
  ADD CONSTRAINT fk_sys_auth_refresh_token_scope_park_binding
  FOREIGN KEY (tenant_id, scope_id, park_id)
  REFERENCES public.sys_business_scope_park_binding (tenant_id, scope_id, park_id);

CREATE FUNCTION public.enforce_smart_park_identity_scope_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous_scope uuid;
  next_scope uuid;
BEGIN
  previous_scope := NULLIF(to_jsonb(OLD) ->> TG_ARGV[0], '')::uuid;
  next_scope := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
  IF previous_scope IS NOT NULL AND next_scope IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_SCOPE_CLEAR_FORBIDDEN',
      ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.enforce_smart_park_identity_role_link()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_role record;
BEGIN
  SELECT role.role_scope, role.scope_id, role.tenant_id, role.park_id
    INTO target_role
    FROM public.sys_role role
   WHERE role.id = NEW.role_id
     AND role.tenant_id = NEW.tenant_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_IDENTITY_MISSING',
      ERRCODE = 'P0001';
  END IF;

  IF NEW.scope_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF target_role.role_scope = 'park' THEN
    IF target_role.scope_id IS DISTINCT FROM NEW.scope_id
       OR target_role.park_id IS DISTINCT FROM NEW.park_id THEN
      RAISE EXCEPTION USING
        MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_MISMATCH',
        ERRCODE = 'P0001';
    END IF;
  ELSIF target_role.role_scope IN ('tenant', 'platform') THEN
    IF target_role.scope_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_MISMATCH',
        ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_MISMATCH',
      ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

CREATE FUNCTION public.enforce_smart_park_identity_role_reverse_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role_scope NOT IN ('tenant', 'park', 'platform')
     OR (NEW.scope_id IS NOT NULL AND NEW.role_scope <> 'park') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_MISMATCH',
      ERRCODE = 'P0001';
  END IF;

  IF OLD.role_scope IS DISTINCT FROM NEW.role_scope
     AND (
       EXISTS (
         SELECT 1 FROM public.rel_user_role link
          WHERE link.role_id = OLD.id
            AND link.tenant_id = OLD.tenant_id
            AND link.scope_id IS NOT NULL
       )
       OR EXISTS (
         SELECT 1 FROM public.rel_role_perm link
          WHERE link.role_id = OLD.id
            AND link.tenant_id = OLD.tenant_id
            AND link.scope_id IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_REVERSE_DRIFT',
      ERRCODE = 'P0001';
  END IF;

  IF NEW.role_scope = 'park' AND NEW.scope_id IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.rel_user_role link
          WHERE link.role_id = OLD.id
            AND link.tenant_id = OLD.tenant_id
            AND link.scope_id IS NOT NULL
            AND (link.scope_id IS DISTINCT FROM NEW.scope_id
              OR link.park_id IS DISTINCT FROM NEW.park_id)
       )
       OR EXISTS (
         SELECT 1 FROM public.rel_role_perm link
          WHERE link.role_id = OLD.id
            AND link.tenant_id = OLD.tenant_id
            AND link.scope_id IS NOT NULL
            AND (link.scope_id IS DISTINCT FROM NEW.scope_id
              OR link.park_id IS DISTINCT FROM NEW.park_id)
       )
     ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_REVERSE_DRIFT',
      ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

CREATE FUNCTION public.enforce_smart_park_refresh_scope_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.scope_id IS NOT NULL AND (
    NEW.scope_id IS DISTINCT FROM OLD.scope_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.park_id IS DISTINCT FROM OLD.park_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_REFRESH_SCOPE_IMMUTABLE',
      ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.enforce_smart_park_identity_scope_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_smart_park_identity_role_link() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_smart_park_identity_role_reverse_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_smart_park_refresh_scope_transition() FROM PUBLIC;

CREATE TRIGGER trg_sys_user_default_scope_transition
BEFORE UPDATE OF default_scope_id ON public.sys_user
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_scope_transition('default_scope_id');

CREATE TRIGGER trg_sys_role_scope_transition
BEFORE UPDATE OF scope_id ON public.sys_role
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_scope_transition('scope_id');

CREATE TRIGGER trg_rel_user_role_scope_transition
BEFORE UPDATE OF scope_id ON public.rel_user_role
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_scope_transition('scope_id');

CREATE TRIGGER trg_rel_role_perm_scope_transition
BEFORE UPDATE OF scope_id ON public.rel_role_perm
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_scope_transition('scope_id');

CREATE TRIGGER trg_sys_auth_refresh_token_scope_transition
BEFORE UPDATE OF tenant_id, park_id, user_id, token_hash, scope_id ON public.sys_auth_refresh_token
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_refresh_scope_transition();

CREATE TRIGGER trg_rel_user_role_scope_role_guard
BEFORE INSERT OR UPDATE OF tenant_id, park_id, role_id, scope_id ON public.rel_user_role
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_role_link();

CREATE TRIGGER trg_rel_role_perm_scope_role_guard
BEFORE INSERT OR UPDATE OF tenant_id, park_id, role_id, scope_id ON public.rel_role_perm
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_role_link();

CREATE TRIGGER trg_sys_role_scope_reverse_guard
BEFORE UPDATE OF tenant_id, park_id, role_scope, scope_id ON public.sys_role
FOR EACH ROW EXECUTE FUNCTION public.enforce_smart_park_identity_role_reverse_binding();

-- Explicit owner-run, tenant-bounded transition. Deleted links and revoked or
-- deleted refresh tokens are intentionally mapped too, preserving history.
CREATE FUNCTION public.backfill_smart_park_identity_scopes(requested_tenant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tenant_row uuid;
  source_users integer := 0;
  updated_users integer := 0;
  source_park_roles integer := 0;
  updated_park_roles integer := 0;
  source_user_role_links integer := 0;
  updated_user_role_links integer := 0;
  source_role_permission_links integer := 0;
  updated_role_permission_links integer := 0;
  source_refresh_tokens integer := 0;
  updated_refresh_tokens integer := 0;
BEGIN
  IF requested_tenant_id IS NULL OR requested_tenant_id = ''
     OR requested_tenant_id <> btrim(requested_tenant_id)
     OR length(requested_tenant_id) > 64 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_INVALID_TENANT',
      ERRCODE = 'P0001';
  END IF;

  LOCK TABLE public.sys_tenant, public.biz_park, public.sys_business_scope,
    public.sys_business_scope_park_binding, public.sys_user, public.sys_role,
    public.sys_permission, public.rel_user_role, public.rel_role_perm,
    public.sys_user_identity, public.sys_auth_refresh_token
    IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM public.sys_tenant tenant
       WHERE tenant.tenant_id = requested_tenant_id
         AND tenant.is_deleted = false) <> 1 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_TENANT_NOT_UNIQUE',
      ERRCODE = 'P0001';
  END IF;

  SELECT tenant.id
    INTO tenant_row
    FROM public.sys_tenant tenant
   WHERE tenant.tenant_id = requested_tenant_id
     AND tenant.is_deleted = false;

  IF EXISTS (
    SELECT park.park_id
      FROM public.biz_park park
     WHERE park.tenant_id = requested_tenant_id
       AND park.is_deleted = false
     GROUP BY park.park_id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_PARK_AMBIGUOUS',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.biz_park park
      LEFT JOIN public.sys_business_scope_park_binding binding
        ON binding.tenant_id = park.tenant_id
       AND binding.park_id = park.park_id
     WHERE park.tenant_id = requested_tenant_id
       AND park.is_deleted = false
       AND binding.scope_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_BINDING_MISSING',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.sys_business_scope_park_binding binding
      LEFT JOIN public.biz_park park
        ON park.id = binding.park_row_id
       AND park.tenant_id = binding.tenant_id
       AND park.park_id = binding.park_id
      LEFT JOIN public.sys_business_scope scope
        ON scope.tenant_id = binding.tenant_id
       AND scope.id = binding.scope_id
     WHERE binding.tenant_id = requested_tenant_id
       AND (
         park.id IS NULL OR park.is_deleted
         OR scope.id IS NULL OR scope.is_deleted
         OR scope.tenant_row_id IS DISTINCT FROM tenant_row
         OR scope.scope_kind <> 'park'
         OR binding.scope_kind <> 'park'
       )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_BINDING_DRIFT',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT users.username
      FROM public.sys_user users
     WHERE users.tenant_id = requested_tenant_id
       AND users.is_deleted = false
     GROUP BY users.username
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ACTIVE_USERNAME_CONFLICT',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT identities.provider, identities.provider_user_id
      FROM public.sys_user_identity identities
     WHERE identities.tenant_id = requested_tenant_id
       AND identities.is_deleted = false
     GROUP BY identities.provider, identities.provider_user_id
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT identities.user_id, identities.provider
      FROM public.sys_user_identity identities
     WHERE identities.tenant_id = requested_tenant_id
       AND identities.is_deleted = false
     GROUP BY identities.user_id, identities.provider
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ACTIVE_PROVIDER_CONFLICT',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sys_role role
     WHERE role.tenant_id = requested_tenant_id
       AND role.role_scope NOT IN ('tenant', 'park', 'platform')
  ) OR EXISTS (
    SELECT 1 FROM public.sys_role role
     WHERE role.tenant_id = requested_tenant_id
       AND role.role_scope IN ('tenant', 'platform')
       AND role.scope_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_MISMATCH',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.rel_user_role link
      JOIN public.sys_role role
        ON role.id = link.role_id AND role.tenant_id = link.tenant_id
     WHERE link.tenant_id = requested_tenant_id
       AND role.role_scope = 'park'
       AND role.park_id IS DISTINCT FROM link.park_id
  ) OR EXISTS (
    SELECT 1
      FROM public.rel_role_perm link
      JOIN public.sys_role role
        ON role.id = link.role_id AND role.tenant_id = link.tenant_id
     WHERE link.tenant_id = requested_tenant_id
       AND role.role_scope = 'park'
       AND role.park_id IS DISTINCT FROM link.park_id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_ROLE_SCOPE_MISMATCH',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    WITH transition_rows AS (
      SELECT users.tenant_id, users.park_id, users.default_scope_id AS existing_scope
        FROM public.sys_user users
       WHERE users.tenant_id = requested_tenant_id
      UNION ALL
      SELECT role.tenant_id, role.park_id, role.scope_id
        FROM public.sys_role role
       WHERE role.tenant_id = requested_tenant_id AND role.role_scope = 'park'
      UNION ALL
      SELECT link.tenant_id, link.park_id, link.scope_id
        FROM public.rel_user_role link
       WHERE link.tenant_id = requested_tenant_id
      UNION ALL
      SELECT link.tenant_id, link.park_id, link.scope_id
        FROM public.rel_role_perm link
       WHERE link.tenant_id = requested_tenant_id
      UNION ALL
      SELECT token.tenant_id, token.park_id, token.scope_id
        FROM public.sys_auth_refresh_token token
       WHERE token.tenant_id = requested_tenant_id
    )
    SELECT 1
      FROM transition_rows source
      LEFT JOIN public.sys_business_scope_park_binding binding
        ON binding.tenant_id = source.tenant_id
       AND binding.park_id = source.park_id
     WHERE binding.scope_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_BINDING_MISSING',
      ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    WITH transition_rows AS (
      SELECT users.tenant_id, users.park_id, users.default_scope_id AS existing_scope
        FROM public.sys_user users
       WHERE users.tenant_id = requested_tenant_id
      UNION ALL
      SELECT role.tenant_id, role.park_id, role.scope_id
        FROM public.sys_role role
       WHERE role.tenant_id = requested_tenant_id AND role.role_scope = 'park'
      UNION ALL
      SELECT link.tenant_id, link.park_id, link.scope_id
        FROM public.rel_user_role link
       WHERE link.tenant_id = requested_tenant_id
      UNION ALL
      SELECT link.tenant_id, link.park_id, link.scope_id
        FROM public.rel_role_perm link
       WHERE link.tenant_id = requested_tenant_id
      UNION ALL
      SELECT token.tenant_id, token.park_id, token.scope_id
        FROM public.sys_auth_refresh_token token
       WHERE token.tenant_id = requested_tenant_id
    )
    SELECT 1
      FROM transition_rows source
      JOIN public.sys_business_scope_park_binding binding
        ON binding.tenant_id = source.tenant_id
       AND binding.park_id = source.park_id
     WHERE source.existing_scope IS NOT NULL
       AND source.existing_scope IS DISTINCT FROM binding.scope_id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'SMART_PARK_IDENTITY_PREPOPULATED_SCOPE_MISMATCH',
      ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO source_users
    FROM public.sys_user users
   WHERE users.tenant_id = requested_tenant_id;
  SELECT count(*) INTO source_park_roles
    FROM public.sys_role role
   WHERE role.tenant_id = requested_tenant_id AND role.role_scope = 'park';
  SELECT count(*) INTO source_user_role_links
    FROM public.rel_user_role link
   WHERE link.tenant_id = requested_tenant_id;
  SELECT count(*) INTO source_role_permission_links
    FROM public.rel_role_perm link
   WHERE link.tenant_id = requested_tenant_id;
  SELECT count(*) INTO source_refresh_tokens
    FROM public.sys_auth_refresh_token token
   WHERE token.tenant_id = requested_tenant_id;

  UPDATE public.sys_user users
     SET default_scope_id = binding.scope_id
    FROM public.sys_business_scope_park_binding binding
   WHERE users.tenant_id = requested_tenant_id
     AND binding.tenant_id = users.tenant_id
     AND binding.park_id = users.park_id
     AND users.default_scope_id IS NULL;
  GET DIAGNOSTICS updated_users = ROW_COUNT;

  UPDATE public.sys_role role
     SET scope_id = binding.scope_id
    FROM public.sys_business_scope_park_binding binding
   WHERE role.tenant_id = requested_tenant_id
     AND role.role_scope = 'park'
     AND binding.tenant_id = role.tenant_id
     AND binding.park_id = role.park_id
     AND role.scope_id IS NULL;
  GET DIAGNOSTICS updated_park_roles = ROW_COUNT;

  UPDATE public.rel_user_role link
     SET scope_id = binding.scope_id
    FROM public.sys_business_scope_park_binding binding
   WHERE link.tenant_id = requested_tenant_id
     AND binding.tenant_id = link.tenant_id
     AND binding.park_id = link.park_id
     AND link.scope_id IS NULL;
  GET DIAGNOSTICS updated_user_role_links = ROW_COUNT;

  UPDATE public.rel_role_perm link
     SET scope_id = binding.scope_id
    FROM public.sys_business_scope_park_binding binding
   WHERE link.tenant_id = requested_tenant_id
     AND binding.tenant_id = link.tenant_id
     AND binding.park_id = link.park_id
     AND link.scope_id IS NULL;
  GET DIAGNOSTICS updated_role_permission_links = ROW_COUNT;

  UPDATE public.sys_auth_refresh_token token
     SET scope_id = binding.scope_id
    FROM public.sys_business_scope_park_binding binding
   WHERE token.tenant_id = requested_tenant_id
     AND binding.tenant_id = token.tenant_id
     AND binding.park_id = token.park_id
     AND token.scope_id IS NULL;
  GET DIAGNOSTICS updated_refresh_tokens = ROW_COUNT;

  RETURN jsonb_build_object(
    'sourceUsers', source_users,
    'updatedUsers', updated_users,
    'sourceParkRoles', source_park_roles,
    'updatedParkRoles', updated_park_roles,
    'sourceUserRoleLinks', source_user_role_links,
    'updatedUserRoleLinks', updated_user_role_links,
    'sourceRolePermissionLinks', source_role_permission_links,
    'updatedRolePermissionLinks', updated_role_permission_links,
    'sourceRefreshTokens', source_refresh_tokens,
    'updatedRefreshTokens', updated_refresh_tokens,
    'totalUpdated', updated_users + updated_park_roles + updated_user_role_links
      + updated_role_permission_links + updated_refresh_tokens
  );
END $$;

REVOKE ALL ON FUNCTION public.backfill_smart_park_identity_scopes(text) FROM PUBLIC;

COMMIT;
