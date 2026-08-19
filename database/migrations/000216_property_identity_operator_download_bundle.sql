BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  target_bundle_id uuid;
  predecessor_hash varchar(64) := '6c7797a89b6246970a5822aa25959091b60bcab719a428d6fde053df2e73db42';
  predecessor_definition_version integer;
  predecessor_status varchar(32);
  predecessor_stored_hash varchar(64);
  predecessor_actual_hash varchar(64);
  predecessor_member_count integer;
  target_hash varchar(64);
BEGIN
  SELECT id, definition_version, definition_hash, status
  INTO target_bundle_id, predecessor_definition_version, predecessor_stored_hash, predecessor_status
  FROM public.sys_property_permission_bundle
  WHERE bundle_code = 'property-bundle:property-identity-operator'
    AND is_deleted = false
  FOR UPDATE;

  IF target_bundle_id IS NULL THEN
    RAISE EXCEPTION 'property-identity-operator-bundle-missing' USING ERRCODE = '23514';
  END IF;

  SELECT count(*),
         encode(
           digest(
             convert_to(
               'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
               || bundle.bundle_name || chr(10)
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
         )
  INTO predecessor_member_count, predecessor_actual_hash
  FROM public.sys_property_permission_bundle bundle
  JOIN public.rel_property_permission_bundle_member member
    ON member.bundle_id = bundle.id
   AND member.is_deleted = false
  WHERE bundle.id = target_bundle_id
  GROUP BY bundle.bundle_code, bundle.bundle_name;

  IF predecessor_definition_version <> 1
     OR predecessor_stored_hash <> predecessor_hash
     OR predecessor_status <> 'enabled'
     OR predecessor_actual_hash <> predecessor_hash
     OR predecessor_member_count <> 7
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT member.member_ordinal::integer AS member_ordinal, member.permission_code::varchar AS permission_code
         FROM public.rel_property_permission_bundle_member member
         WHERE member.bundle_id = target_bundle_id
           AND member.is_deleted = false
         EXCEPT
         SELECT expected.member_ordinal, expected.permission_code
         FROM (VALUES
           (1, 'asset:party'::varchar),
           (2, 'asset:identity-submissions:page'::varchar),
           (3, 'party:read'::varchar),
           (4, 'party:identity_update'::varchar),
           (5, 'file:read'::varchar),
           (6, 'file:upload'::varchar),
           (7, 'file:delete'::varchar)
         ) expected(member_ordinal, permission_code)
       ) drift
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT expected.member_ordinal, expected.permission_code
         FROM (VALUES
           (1, 'asset:party'::varchar),
           (2, 'asset:identity-submissions:page'::varchar),
           (3, 'party:read'::varchar),
           (4, 'party:identity_update'::varchar),
           (5, 'file:read'::varchar),
           (6, 'file:upload'::varchar),
           (7, 'file:delete'::varchar)
         ) expected(member_ordinal, permission_code)
         EXCEPT
         SELECT member.member_ordinal::integer AS member_ordinal, member.permission_code::varchar AS permission_code
         FROM public.rel_property_permission_bundle_member member
         WHERE member.bundle_id = target_bundle_id
           AND member.is_deleted = false
       ) missing
     ) THEN
    RAISE EXCEPTION 'property-identity-operator-bundle-predecessor-drift' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rel_property_permission_bundle_member
  SET member_ordinal = 8,
      remark = 'Issue #306 identity operator bundle file download repair',
      version = version + 1
  WHERE bundle_id = target_bundle_id
    AND permission_code = 'file:delete'
    AND member_ordinal <> 8
    AND is_deleted = false;

  INSERT INTO public.rel_property_permission_bundle_member (
    bundle_id, permission_code, member_ordinal, remark
  )
  VALUES (
    target_bundle_id,
    'file:download',
    7,
    'Issue #306 identity operator bundle file download repair'
  )
  ON CONFLICT (bundle_id, permission_code) WHERE is_deleted = false DO UPDATE
  SET member_ordinal = EXCLUDED.member_ordinal,
      remark = EXCLUDED.remark,
      version = rel_property_permission_bundle_member.version + 1;

  SELECT encode(
           digest(
             convert_to(
               'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
               || bundle.bundle_name || chr(10)
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
         )
  INTO target_hash
  FROM public.sys_property_permission_bundle bundle
  JOIN public.rel_property_permission_bundle_member member
    ON member.bundle_id = bundle.id
   AND member.is_deleted = false
  WHERE bundle.id = target_bundle_id
  GROUP BY bundle.bundle_code, bundle.bundle_name;

  UPDATE public.sys_property_permission_bundle
  SET definition_version = GREATEST(definition_version + 1, 2),
      definition_hash = target_hash,
      update_time = clock_timestamp(),
      version = version + 1
  WHERE id = target_bundle_id
    AND is_deleted = false;
END;
$$;

DO $$
DECLARE
  unresolved_tenants text;
BEGIN
  WITH affected_tenants AS (
    SELECT DISTINCT role.tenant_id
    FROM public.sys_role role
    WHERE role.is_deleted = false
      AND role.applied_bundle_codes ? 'property-bundle:property-identity-operator'
  ),
  permission_counts AS (
    SELECT tenant.tenant_id, count(permission.id)::int AS permission_count
    FROM affected_tenants tenant
    LEFT JOIN public.sys_permission permission
      ON permission.tenant_id = tenant.tenant_id
     AND permission.code = 'file:download'
     AND permission.is_enabled = true
     AND permission.status = 'enabled'
     AND permission.is_deleted = false
    GROUP BY tenant.tenant_id
  )
  SELECT string_agg(tenant_id || ':' || permission_count::text, ', ' ORDER BY tenant_id)
  INTO unresolved_tenants
  FROM permission_counts
  WHERE permission_count <> 1;

  IF unresolved_tenants IS NOT NULL THEN
    RAISE EXCEPTION 'property-identity-operator-file-download-permission-unresolved:%', unresolved_tenants
      USING ERRCODE = '23514';
  END IF;
END;
$$;

WITH identity_operator_roles AS (
  SELECT role.tenant_id, role.park_id, role.id AS role_id
  FROM public.sys_role role
  WHERE role.is_deleted = false
    AND role.applied_bundle_codes ? 'property-bundle:property-identity-operator'
),
download_permissions AS (
  SELECT permission.tenant_id, permission.id AS permission_id
  FROM public.sys_permission permission
  WHERE permission.code = 'file:download'
    AND permission.is_enabled = true
    AND permission.status = 'enabled'
    AND permission.is_deleted = false
)
INSERT INTO public.rel_role_perm (
  tenant_id, park_id, role_id, permission_id, remark
)
SELECT role.tenant_id, role.park_id, role.role_id, permission.permission_id,
       'Issue #306 identity operator evidence preview/download repair'
FROM identity_operator_roles role
JOIN download_permissions permission
  ON permission.tenant_id = role.tenant_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rel_role_perm existing
  WHERE existing.tenant_id = role.tenant_id
    AND existing.park_id = role.park_id
    AND existing.role_id = role.role_id
    AND existing.permission_id = permission.permission_id
    AND existing.is_deleted = false
);

WITH role_bundle_signatures AS (
  SELECT encode(
           digest(
             convert_to(
               string_agg(
                 bundle.bundle_code || '@' || bundle.definition_version::text || ':' || bundle.definition_hash,
                 chr(10) ORDER BY bundle.bundle_code
               ),
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         ) AS signature,
         role.tenant_id,
         role.park_id,
         role.id AS role_id
  FROM public.sys_role role
  JOIN public.sys_property_permission_bundle bundle
    ON role.applied_bundle_codes ? bundle.bundle_code
   AND bundle.status = 'enabled'
   AND bundle.is_deleted = false
  WHERE role.is_deleted = false
    AND role.applied_bundle_codes ? 'property-bundle:property-identity-operator'
  GROUP BY role.tenant_id, role.park_id, role.id
)
UPDATE public.sys_role role
SET applied_bundle_signature = role_bundle_signatures.signature,
    update_time = clock_timestamp(),
    version = role.version + 1
FROM role_bundle_signatures
WHERE role.tenant_id = role_bundle_signatures.tenant_id
  AND role.park_id = role_bundle_signatures.park_id
  AND role.id = role_bundle_signatures.role_id
  AND role.is_deleted = false
  AND role.applied_bundle_signature IS DISTINCT FROM role_bundle_signatures.signature;

COMMIT;
