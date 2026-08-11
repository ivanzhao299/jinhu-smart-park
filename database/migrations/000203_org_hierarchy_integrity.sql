BEGIN;

-- The previous API version may still be serving traffic while production migrations run.
-- Block concurrent hierarchy writes before inspecting the existing graph.
LOCK TABLE sys_org IN SHARE ROW EXCLUSIVE MODE;

-- Older user-move code could leave active organization links in the user's former tenant.
-- Secondary-park links inside the current tenant remain valid and must be preserved.
UPDATE rel_user_org link
SET is_deleted = true,
    update_time = now()
FROM sys_user target_user
WHERE target_user.id = link.user_id
  AND link.is_deleted = false
  AND link.tenant_id <> target_user.tenant_id;

DO $preflight$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM sys_org child
  LEFT JOIN sys_org parent ON parent.id = child.parent_id
  WHERE child.parent_id IS NOT NULL
    AND child.is_deleted = false
    AND (
      parent.id IS NULL
      OR parent.is_deleted = true
      OR parent.status <> 'enabled'
      OR parent.tenant_id <> child.tenant_id
      OR parent.park_id <> child.park_id
  );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'org-hierarchy-preflight: % orphan, inactive-parent, or cross-scope parent links', invalid_count;
  END IF;

  WITH RECURSIVE walk AS (
    SELECT id AS origin_id, parent_id, ARRAY[id] AS path, false AS cycle
    FROM sys_org WHERE is_deleted = false
    UNION ALL
    SELECT walk.origin_id, parent.parent_id, walk.path || parent.id, parent.id = ANY(walk.path)
    FROM walk JOIN sys_org parent ON parent.id = walk.parent_id
    WHERE walk.parent_id IS NOT NULL AND NOT walk.cycle
  )
  SELECT count(*) INTO invalid_count FROM walk WHERE cycle;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'org-hierarchy-preflight: % cyclic organization links', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM (
    SELECT tenant_id, park_id, user_id
    FROM rel_user_org
    WHERE is_deleted = false AND is_primary = true
    GROUP BY tenant_id, park_id, user_id
    HAVING count(*) > 1
  ) duplicated;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'org-hierarchy-preflight: % users have multiple primary organizations', invalid_count;
  END IF;
END
$preflight$;

CREATE INDEX IF NOT EXISTS idx_sys_org_scope_parent_active
  ON sys_org (tenant_id, park_id, parent_id)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_org_id_scope
  ON sys_org (id, tenant_id, park_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_user_org_assignment_active
  ON rel_user_org (tenant_id, park_id, user_id, org_id, COALESCE(post_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_user_org_primary_active
  ON rel_user_org (tenant_id, park_id, user_id)
  WHERE is_deleted = false AND is_primary = true;

ALTER TABLE sys_org
  ADD CONSTRAINT fk_sys_org_parent
  FOREIGN KEY (parent_id, tenant_id, park_id) REFERENCES sys_org(id, tenant_id, park_id)
  ON DELETE RESTRICT;

COMMIT;
