BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_temp;

LOCK TABLE public.biz_homestay_booking, public.biz_homestay_turnover_task,
  public.biz_housing_lease, public.biz_property_occupancy
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  mismatch record;
BEGIN
  SELECT relation_name, occupancy_id, source_id INTO mismatch
  FROM (
    SELECT 'biz_property_occupancy.homestay_booking_owner' AS relation_name,
      occupancy.id AS occupancy_id, occupancy.source_id
    FROM public.biz_property_occupancy occupancy
    LEFT JOIN public.biz_homestay_booking owner
      ON owner.tenant_id=occupancy.tenant_id AND owner.park_id=occupancy.park_id
     AND owner.id::text=occupancy.source_id AND owner.occupancy_id=occupancy.id
     AND owner.unit_id=occupancy.unit_id AND owner.is_deleted=false
    WHERE occupancy.is_deleted=false
      AND (occupancy.source_domain,occupancy.source_type)=('homestay','homestay_booking')
      AND owner.id IS NULL
    UNION ALL
    SELECT 'biz_property_occupancy.homestay_turnover_owner',
      occupancy.id, occupancy.source_id
    FROM public.biz_property_occupancy occupancy
    LEFT JOIN public.biz_homestay_turnover_task owner
      ON owner.tenant_id=occupancy.tenant_id AND owner.park_id=occupancy.park_id
     AND owner.id::text=occupancy.source_id AND owner.occupancy_id=occupancy.id
     AND owner.unit_id=occupancy.unit_id AND owner.is_deleted=false
    WHERE occupancy.is_deleted=false
      AND (occupancy.source_domain,occupancy.source_type)=('operations','homestay_turnover')
      AND owner.id IS NULL
    UNION ALL
    SELECT 'biz_property_occupancy.housing_lease_owner',
      occupancy.id, occupancy.source_id
    FROM public.biz_property_occupancy occupancy
    LEFT JOIN public.biz_housing_lease owner
      ON owner.tenant_id=occupancy.tenant_id AND owner.park_id=occupancy.park_id
     AND owner.id::text=occupancy.source_id AND owner.occupancy_id=occupancy.id
     AND owner.unit_id=occupancy.unit_id AND owner.is_deleted=false
    WHERE occupancy.is_deleted=false
      AND (occupancy.source_domain,occupancy.source_type)=('housing_rental','housing_lease')
      AND owner.id IS NULL
  ) drift LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '000212 property occupancy owner missing: relation=%, occupancy_id=%, source_id=%',
      mismatch.relation_name, mismatch.occupancy_id, mismatch.source_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_property_mvp_occupancy_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE occupancy_row public.biz_property_occupancy%ROWTYPE;
DECLARE booking_unit_id uuid;
BEGIN
  IF NEW.is_deleted AND NEW.occupancy_id IS NOT NULL THEN
    RAISE EXCEPTION 'property occupancy owner cannot be soft-deleted while linked' USING ERRCODE='23503';
  END IF;
  IF TG_TABLE_NAME = 'biz_homestay_turnover_task' THEN
    SELECT unit_id INTO booking_unit_id FROM public.biz_homestay_booking
     WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.booking_id;
    IF booking_unit_id IS DISTINCT FROM NEW.unit_id THEN
      RAISE EXCEPTION 'homestay turnover booking/unit owner mismatch' USING ERRCODE='23503';
    END IF;
  END IF;
  IF NEW.occupancy_id IS NULL THEN
    IF TG_OP='UPDATE' AND OLD.occupancy_id IS NOT NULL THEN
      RAISE EXCEPTION 'property occupancy owner link cannot be cleared' USING ERRCODE='23503';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO occupancy_row FROM public.biz_property_occupancy
   WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.occupancy_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF occupancy_row.is_deleted THEN
    RAISE EXCEPTION 'deleted property occupancy cannot be linked' USING ERRCODE='23503';
  END IF;
  IF occupancy_row.unit_id IS DISTINCT FROM NEW.unit_id THEN
    RAISE EXCEPTION 'property occupancy unit owner mismatch' USING ERRCODE='23503';
  END IF;
  IF TG_TABLE_NAME = 'biz_homestay_booking'
     AND (occupancy_row.source_domain,occupancy_row.source_type,occupancy_row.source_id)
       IS DISTINCT FROM ('homestay','homestay_booking',NEW.id::text) THEN
    RAISE EXCEPTION 'homestay booking occupancy owner mismatch' USING ERRCODE='23503';
  ELSIF TG_TABLE_NAME = 'biz_homestay_turnover_task'
     AND (occupancy_row.source_domain,occupancy_row.source_type,occupancy_row.source_id)
       IS DISTINCT FROM ('operations','homestay_turnover',NEW.id::text) THEN
    RAISE EXCEPTION 'homestay turnover occupancy owner mismatch' USING ERRCODE='23503';
  ELSIF TG_TABLE_NAME = 'biz_housing_lease'
     AND (occupancy_row.source_domain,occupancy_row.source_type,occupancy_row.source_id)
       IS DISTINCT FROM ('housing_rental','housing_lease',NEW.id::text) THEN
    RAISE EXCEPTION 'housing lease occupancy owner mismatch' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_homestay_booking_occupancy_owner ON public.biz_homestay_booking;
CREATE TRIGGER trg_homestay_booking_occupancy_owner
BEFORE INSERT OR UPDATE OF id,tenant_id,park_id,unit_id,occupancy_id,is_deleted ON public.biz_homestay_booking
FOR EACH ROW EXECUTE FUNCTION public.enforce_property_mvp_occupancy_owner();

DROP TRIGGER IF EXISTS trg_homestay_turnover_occupancy_owner ON public.biz_homestay_turnover_task;
CREATE TRIGGER trg_homestay_turnover_occupancy_owner
BEFORE INSERT OR UPDATE OF id,tenant_id,park_id,booking_id,unit_id,occupancy_id,is_deleted ON public.biz_homestay_turnover_task
FOR EACH ROW EXECUTE FUNCTION public.enforce_property_mvp_occupancy_owner();

DROP TRIGGER IF EXISTS trg_housing_lease_occupancy_owner ON public.biz_housing_lease;
CREATE TRIGGER trg_housing_lease_occupancy_owner
BEFORE INSERT OR UPDATE OF id,tenant_id,park_id,unit_id,occupancy_id,is_deleted ON public.biz_housing_lease
FOR EACH ROW EXECUTE FUNCTION public.enforce_property_mvp_occupancy_owner();

CREATE OR REPLACE FUNCTION public.enforce_property_mvp_occupancy_reverse_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_deleted AND NOT OLD.is_deleted AND (
    EXISTS (SELECT 1 FROM public.biz_homestay_booking owner WHERE owner.occupancy_id=OLD.id AND owner.is_deleted=false)
    OR EXISTS (SELECT 1 FROM public.biz_homestay_turnover_task owner WHERE owner.occupancy_id=OLD.id AND owner.is_deleted=false)
    OR EXISTS (SELECT 1 FROM public.biz_housing_lease owner WHERE owner.occupancy_id=OLD.id AND owner.is_deleted=false)
  ) THEN
    RAISE EXCEPTION 'linked property occupancy cannot be soft-deleted' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.biz_homestay_booking owner
     WHERE owner.occupancy_id=OLD.id AND owner.is_deleted=false
       AND (owner.tenant_id,owner.park_id,owner.unit_id,'homestay','homestay_booking',owner.id::text)
         IS DISTINCT FROM (NEW.tenant_id,NEW.park_id,NEW.unit_id,NEW.source_domain,NEW.source_type,NEW.source_id)
  ) THEN
    RAISE EXCEPTION 'homestay booking occupancy reverse owner mismatch' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.biz_homestay_turnover_task owner
     WHERE owner.occupancy_id=OLD.id AND owner.is_deleted=false
       AND (owner.tenant_id,owner.park_id,owner.unit_id,'operations','homestay_turnover',owner.id::text)
         IS DISTINCT FROM (NEW.tenant_id,NEW.park_id,NEW.unit_id,NEW.source_domain,NEW.source_type,NEW.source_id)
  ) THEN
    RAISE EXCEPTION 'homestay turnover occupancy reverse owner mismatch' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.biz_housing_lease owner
     WHERE owner.occupancy_id=OLD.id AND owner.is_deleted=false
       AND (owner.tenant_id,owner.park_id,owner.unit_id,'housing_rental','housing_lease',owner.id::text)
         IS DISTINCT FROM (NEW.tenant_id,NEW.park_id,NEW.unit_id,NEW.source_domain,NEW.source_type,NEW.source_id)
  ) THEN
    RAISE EXCEPTION 'housing lease occupancy reverse owner mismatch' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
