BEGIN;

ALTER TABLE sys_org
  ADD COLUMN IF NOT EXISTS legacy_source_id integer,
  ADD COLUMN IF NOT EXISTS legacy_hierarchy_level smallint,
  ADD COLUMN IF NOT EXISTS legacy_manager_reference varchar(10),
  ADD COLUMN IF NOT EXISTS planned_headcount integer,
  ADD COLUMN IF NOT EXISTS contact_phone varchar(50);

ALTER TABLE hr_position
  ADD COLUMN IF NOT EXISTS reports_to_position_id uuid,
  ADD COLUMN IF NOT EXISTS hierarchy_level smallint,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_source_id integer,
  ADD COLUMN IF NOT EXISTS legacy_upto_code varchar(30),
  ADD COLUMN IF NOT EXISTS authority varchar(1024),
  ADD COLUMN IF NOT EXISTS qualification varchar(1024),
  ADD COLUMN IF NOT EXISTS responsibilities varchar(1024),
  ADD COLUMN IF NOT EXISTS position_manual varchar(256);

ALTER TABLE hr_employee_profile
  ADD COLUMN IF NOT EXISTS legacy_professional_title_code varchar(2);

COMMENT ON COLUMN hr_employee_profile.legacy_professional_title_code IS
  'Protected Yuzhou assignment code. The legacy assignment dictionary means professional title, not position.';

ALTER TABLE sys_org
  ADD CONSTRAINT ck_sys_org_planned_headcount_nonnegative
  CHECK (planned_headcount IS NULL OR planned_headcount >= 0),
  ADD CONSTRAINT ck_sys_org_legacy_hierarchy_level_nonnegative
  CHECK (legacy_hierarchy_level IS NULL OR legacy_hierarchy_level >= 0);

ALTER TABLE hr_position
  ADD CONSTRAINT ck_hr_position_hierarchy_level_nonnegative
  CHECK (hierarchy_level IS NULL OR hierarchy_level >= 0),
  ADD CONSTRAINT ck_hr_position_reports_to_not_self
  CHECK (reports_to_position_id IS NULL OR reports_to_position_id <> id),
  ADD CONSTRAINT fk_hr_position_reports_to_scope
  FOREIGN KEY (tenant_id, park_id, reports_to_position_id)
  REFERENCES hr_position(tenant_id, park_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ix_hr_position_reports_to_scope
  ON hr_position(tenant_id, park_id, reports_to_position_id)
  WHERE is_deleted = false AND reports_to_position_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hr_position_hierarchy_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  has_cycle boolean;
  parent_active boolean;
BEGIN
  IF (NEW.is_deleted OR NEW.status <> 'enabled') AND EXISTS (
    SELECT 1 FROM hr_position child
    WHERE (child.tenant_id, child.park_id, child.reports_to_position_id) = (NEW.tenant_id, NEW.park_id, NEW.id)
      AND child.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'position with active reports cannot be disabled or deleted';
  END IF;
  IF NEW.reports_to_position_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT true INTO parent_active
    FROM hr_position parent
    WHERE (parent.tenant_id, parent.park_id, parent.id) = (NEW.tenant_id, NEW.park_id, NEW.reports_to_position_id)
      AND parent.is_deleted = false AND parent.status = 'enabled'
    FOR SHARE;
  IF COALESCE(parent_active, false) = false THEN
    RAISE EXCEPTION 'parent position must be active in the same scope';
  END IF;
  WITH RECURSIVE ancestors AS (
    SELECT parent.id, parent.reports_to_position_id, ARRAY[parent.id] AS path, false AS cycle
    FROM hr_position parent
    WHERE (parent.tenant_id, parent.park_id, parent.id) = (NEW.tenant_id, NEW.park_id, NEW.reports_to_position_id)
      AND parent.is_deleted = false
    UNION ALL
    SELECT parent.id, parent.reports_to_position_id, ancestors.path || parent.id, parent.id = ANY(ancestors.path)
    FROM ancestors
    JOIN hr_position parent
      ON (parent.tenant_id, parent.park_id, parent.id) = (NEW.tenant_id, NEW.park_id, ancestors.reports_to_position_id)
     AND parent.is_deleted = false
    WHERE ancestors.reports_to_position_id IS NOT NULL AND NOT ancestors.cycle
  )
  SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id OR cycle) INTO has_cycle;
  IF has_cycle THEN
    RAISE EXCEPTION 'position hierarchy cannot contain a cycle';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_position_hierarchy_guard ON hr_position;
CREATE TRIGGER trg_hr_position_hierarchy_guard
BEFORE INSERT OR UPDATE OF tenant_id, park_id, reports_to_position_id, status, is_deleted
ON hr_position FOR EACH ROW EXECUTE FUNCTION hr_position_hierarchy_guard();

COMMIT;
