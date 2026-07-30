CREATE OR REPLACE FUNCTION enforce_property_occupancy_contract_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_deleted = false AND NEW.status IN ('held', 'active') THEN
    PERFORM lock_property_unit_scope(NEW.tenant_id, NEW.park_id, NEW.unit_id);
    IF EXISTS (
      SELECT 1
      FROM rel_leasing_contract_unit relation
      JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
      WHERE relation.tenant_id = NEW.tenant_id
        AND relation.park_id = NEW.park_id
        AND relation.unit_id = NEW.unit_id
        AND relation.is_deleted = false
        AND relation.status = 1
        AND contract.is_deleted = false
        AND contract.status NOT IN ('90', '91')
        AND (relation.start_date::timestamp AT TIME ZONE 'Asia/Shanghai') < NEW.end_at
        AND ((relation.end_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai') > NEW.start_at
        AND NOT (
          NEW.source_type = 'leasing_contract'
          AND NEW.source_id = contract.id::text
        )
    ) THEN
      RAISE EXCEPTION 'property occupancy conflicts with commercial leasing contract'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_contract_unit_property_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_deleted = false AND NEW.status = 1 THEN
    PERFORM lock_property_unit_scope(NEW.tenant_id, NEW.park_id, NEW.unit_id);
    IF EXISTS (
      SELECT 1
      FROM biz_property_operation_config config
      WHERE config.tenant_id = NEW.tenant_id
        AND config.park_id = NEW.park_id
        AND config.unit_id = NEW.unit_id
        AND config.is_deleted = false
        AND config.operating_mode = 'short_stay'
    ) THEN
      RAISE EXCEPTION 'short-stay unit cannot be linked to commercial leasing contract'
        USING ERRCODE = '23P01';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM biz_property_occupancy occupancy
      WHERE occupancy.tenant_id = NEW.tenant_id
        AND occupancy.park_id = NEW.park_id
        AND occupancy.unit_id = NEW.unit_id
        AND occupancy.is_deleted = false
        AND (
          occupancy.status = 'active'
          OR (
            occupancy.status = 'held'
            AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > now())
          )
        )
        AND occupancy.start_at < ((NEW.end_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
        AND occupancy.end_at > (NEW.start_date::timestamp AT TIME ZONE 'Asia/Shanghai')
        AND NOT (
          occupancy.source_type = 'leasing_contract'
          AND occupancy.source_id = NEW.contract_id::text
        )
    ) THEN
      RAISE EXCEPTION 'commercial leasing contract conflicts with shared property occupancy'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
