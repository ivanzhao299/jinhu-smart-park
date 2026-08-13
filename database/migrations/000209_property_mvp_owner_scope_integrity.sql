BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Freeze every table participating in the owner scan until the constraints and
-- inverse triggers are installed, closing the online preflight/write window.
LOCK TABLE biz_homestay_booking, biz_homestay_turnover_task, biz_housing_lease,
  biz_property_occupancy IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  mismatch record;
BEGIN
  SELECT relation_name, child_id, parent_id INTO mismatch
  FROM (
    SELECT 'biz_homestay_rate_config.unit_id' relation_name, child.id child_id, parent.id parent_id
      FROM biz_homestay_rate_config child JOIN biz_unit parent ON parent.id=child.unit_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_rate_override.unit_id',child.id,parent.id
      FROM biz_homestay_rate_override child JOIN biz_unit parent ON parent.id=child.unit_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_booking.unit_id',child.id,parent.id
      FROM biz_homestay_booking child JOIN biz_unit parent ON parent.id=child.unit_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_booking.booker_party_id',child.id,parent.id
      FROM biz_homestay_booking child JOIN biz_party parent ON parent.id=child.booker_party_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_booking.occupancy_id',child.id,parent.id
      FROM biz_homestay_booking child JOIN biz_property_occupancy parent ON parent.id=child.occupancy_id
     WHERE (child.tenant_id,child.park_id,child.unit_id,'homestay','homestay_booking',child.id::text,false)
       IS DISTINCT FROM (parent.tenant_id,parent.park_id,parent.unit_id,parent.source_domain,parent.source_type,parent.source_id,parent.is_deleted)
    UNION ALL SELECT 'biz_homestay_booking_night.booking_id',child.id,parent.id
      FROM biz_homestay_booking_night child JOIN biz_homestay_booking parent ON parent.id=child.booking_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'rel_homestay_booking_guest.booking_id',child.id,parent.id
      FROM rel_homestay_booking_guest child JOIN biz_homestay_booking parent ON parent.id=child.booking_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'rel_homestay_booking_guest.party_id',child.id,parent.id
      FROM rel_homestay_booking_guest child JOIN biz_party parent ON parent.id=child.party_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_stay_credential.booking_id',child.id,parent.id
      FROM biz_homestay_stay_credential child JOIN biz_homestay_booking parent ON parent.id=child.booking_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_turnover_task.booking_id',child.id,parent.id
      FROM biz_homestay_turnover_task child JOIN biz_homestay_booking parent ON parent.id=child.booking_id
     WHERE (child.tenant_id,child.park_id,child.unit_id)
       IS DISTINCT FROM (parent.tenant_id,parent.park_id,parent.unit_id)
    UNION ALL SELECT 'biz_homestay_turnover_task.unit_id',child.id,parent.id
      FROM biz_homestay_turnover_task child JOIN biz_unit parent ON parent.id=child.unit_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_homestay_turnover_task.occupancy_id',child.id,parent.id
      FROM biz_homestay_turnover_task child JOIN biz_property_occupancy parent ON parent.id=child.occupancy_id
     WHERE (child.tenant_id,child.park_id,child.unit_id,'operations','homestay_turnover',child.id::text,false)
       IS DISTINCT FROM (parent.tenant_id,parent.park_id,parent.unit_id,parent.source_domain,parent.source_type,parent.source_id,parent.is_deleted)
    UNION ALL SELECT 'biz_homestay_booking_action_log.booking_id',child.id,parent.id
      FROM biz_homestay_booking_action_log child JOIN biz_homestay_booking parent ON parent.id=child.booking_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_housing_lease.unit_id',child.id,parent.id
      FROM biz_housing_lease child JOIN biz_unit parent ON parent.id=child.unit_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_housing_lease.tenant_party_id',child.id,parent.id
      FROM biz_housing_lease child JOIN biz_party parent ON parent.id=child.tenant_party_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_housing_lease.occupancy_id',child.id,parent.id
      FROM biz_housing_lease child JOIN biz_property_occupancy parent ON parent.id=child.occupancy_id
     WHERE (child.tenant_id,child.park_id,child.unit_id,'housing_rental','housing_lease',child.id::text,false)
       IS DISTINCT FROM (parent.tenant_id,parent.park_id,parent.unit_id,parent.source_domain,parent.source_type,parent.source_id,parent.is_deleted)
    UNION ALL SELECT 'rel_housing_lease_occupant.lease_id',child.id,parent.id
      FROM rel_housing_lease_occupant child JOIN biz_housing_lease parent ON parent.id=child.lease_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'rel_housing_lease_occupant.party_id',child.id,parent.id
      FROM rel_housing_lease_occupant child JOIN biz_party parent ON parent.id=child.party_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_housing_purchase.unit_id',child.id,parent.id
      FROM biz_housing_purchase child JOIN biz_unit parent ON parent.id=child.unit_id
     WHERE (child.tenant_id,child.park_id) IS DISTINCT FROM (parent.tenant_id,parent.park_id)
    UNION ALL SELECT 'biz_housing_receivable.charge_plan_id',child.id,parent.id
      FROM biz_housing_receivable child JOIN biz_housing_charge_plan parent ON parent.id=child.charge_plan_id
     WHERE (child.tenant_id,child.park_id,child.lease_id,child.currency)
       IS DISTINCT FROM (parent.tenant_id,parent.park_id,parent.lease_id,parent.currency)
  ) drift LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '000209 owner scope mismatch: relation=%, child_id=%, parent_id=%',
      mismatch.relation_name, mismatch.child_id, mismatch.parent_id;
  END IF;
END $$;

ALTER TABLE biz_unit
  ADD CONSTRAINT uq_biz_unit_scope_id UNIQUE (tenant_id, park_id, id);
ALTER TABLE biz_homestay_booking
  ADD CONSTRAINT uq_homestay_booking_scope_unit UNIQUE (tenant_id,park_id,id,unit_id);

ALTER TABLE biz_homestay_rate_config DROP CONSTRAINT biz_homestay_rate_config_unit_id_fkey;
ALTER TABLE biz_homestay_rate_override DROP CONSTRAINT biz_homestay_rate_override_unit_id_fkey;
ALTER TABLE biz_homestay_booking
  DROP CONSTRAINT biz_homestay_booking_unit_id_fkey,
  DROP CONSTRAINT biz_homestay_booking_booker_party_id_fkey,
  DROP CONSTRAINT biz_homestay_booking_occupancy_id_fkey;
ALTER TABLE biz_homestay_booking_night DROP CONSTRAINT biz_homestay_booking_night_booking_id_fkey;
ALTER TABLE rel_homestay_booking_guest
  DROP CONSTRAINT rel_homestay_booking_guest_booking_id_fkey,
  DROP CONSTRAINT rel_homestay_booking_guest_party_id_fkey;
ALTER TABLE biz_homestay_stay_credential DROP CONSTRAINT biz_homestay_stay_credential_booking_id_fkey;
ALTER TABLE biz_homestay_ledger_entry DROP CONSTRAINT biz_homestay_ledger_entry_booking_id_fkey;
ALTER TABLE biz_homestay_turnover_task
  DROP CONSTRAINT biz_homestay_turnover_task_booking_id_fkey,
  DROP CONSTRAINT biz_homestay_turnover_task_unit_id_fkey,
  DROP CONSTRAINT biz_homestay_turnover_task_occupancy_id_fkey;
ALTER TABLE biz_homestay_booking_action_log DROP CONSTRAINT biz_homestay_booking_action_log_booking_id_fkey;

ALTER TABLE biz_homestay_rate_config ADD CONSTRAINT fk_homestay_rate_config_unit_scope
  FOREIGN KEY (tenant_id,park_id,unit_id) REFERENCES biz_unit(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_homestay_rate_override ADD CONSTRAINT fk_homestay_rate_override_unit_scope
  FOREIGN KEY (tenant_id,park_id,unit_id) REFERENCES biz_unit(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_homestay_booking
  ADD CONSTRAINT fk_homestay_booking_unit_scope FOREIGN KEY (tenant_id,park_id,unit_id) REFERENCES biz_unit(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_homestay_booking_party_scope FOREIGN KEY (tenant_id,park_id,booker_party_id) REFERENCES biz_party(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_homestay_booking_occupancy_scope FOREIGN KEY (tenant_id,park_id,occupancy_id) REFERENCES biz_property_occupancy(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_homestay_booking_night ADD CONSTRAINT fk_homestay_booking_night_booking_scope
  FOREIGN KEY (tenant_id,park_id,booking_id) REFERENCES biz_homestay_booking(tenant_id,park_id,id) NOT VALID;
ALTER TABLE rel_homestay_booking_guest
  ADD CONSTRAINT fk_homestay_booking_guest_booking_scope FOREIGN KEY (tenant_id,park_id,booking_id) REFERENCES biz_homestay_booking(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_homestay_booking_guest_party_scope FOREIGN KEY (tenant_id,park_id,party_id) REFERENCES biz_party(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_homestay_stay_credential ADD CONSTRAINT fk_homestay_credential_booking_scope
  FOREIGN KEY (tenant_id,park_id,booking_id) REFERENCES biz_homestay_booking(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_homestay_turnover_task
  ADD CONSTRAINT fk_homestay_turnover_booking_scope FOREIGN KEY (tenant_id,park_id,booking_id,unit_id) REFERENCES biz_homestay_booking(tenant_id,park_id,id,unit_id) NOT VALID,
  ADD CONSTRAINT fk_homestay_turnover_unit_scope FOREIGN KEY (tenant_id,park_id,unit_id) REFERENCES biz_unit(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_homestay_turnover_occupancy_scope FOREIGN KEY (tenant_id,park_id,occupancy_id) REFERENCES biz_property_occupancy(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_homestay_booking_action_log ADD CONSTRAINT fk_homestay_action_booking_scope
  FOREIGN KEY (tenant_id,park_id,booking_id) REFERENCES biz_homestay_booking(tenant_id,park_id,id) NOT VALID;

ALTER TABLE biz_housing_lease
  DROP CONSTRAINT biz_housing_lease_unit_id_fkey,
  DROP CONSTRAINT biz_housing_lease_tenant_party_id_fkey,
  DROP CONSTRAINT biz_housing_lease_occupancy_id_fkey,
  ADD CONSTRAINT fk_housing_lease_unit_scope FOREIGN KEY (tenant_id,park_id,unit_id) REFERENCES biz_unit(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_housing_lease_party_scope FOREIGN KEY (tenant_id,park_id,tenant_party_id) REFERENCES biz_party(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_housing_lease_occupancy_scope FOREIGN KEY (tenant_id,park_id,occupancy_id) REFERENCES biz_property_occupancy(tenant_id,park_id,id) NOT VALID;
ALTER TABLE rel_housing_lease_occupant
  DROP CONSTRAINT rel_housing_lease_occupant_lease_id_fkey,
  DROP CONSTRAINT rel_housing_lease_occupant_party_id_fkey,
  ADD CONSTRAINT fk_housing_occupant_lease_scope FOREIGN KEY (tenant_id,park_id,lease_id) REFERENCES biz_housing_lease(tenant_id,park_id,id) NOT VALID,
  ADD CONSTRAINT fk_housing_occupant_party_scope FOREIGN KEY (tenant_id,park_id,party_id) REFERENCES biz_party(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_housing_charge_plan DROP CONSTRAINT biz_housing_charge_plan_lease_id_fkey;
-- 000192 already installed and validated the replacement lease/currency owner FK.
ALTER TABLE biz_housing_charge_plan
  ADD CONSTRAINT uq_housing_charge_plan_owner UNIQUE (tenant_id,park_id,id,lease_id,currency);
ALTER TABLE biz_housing_receivable
  DROP CONSTRAINT biz_housing_receivable_lease_id_fkey,
  DROP CONSTRAINT biz_housing_receivable_charge_plan_id_fkey,
  ADD CONSTRAINT fk_housing_receivable_charge_plan_scope FOREIGN KEY (tenant_id,park_id,charge_plan_id,lease_id,currency)
    REFERENCES biz_housing_charge_plan(tenant_id,park_id,id,lease_id,currency) NOT VALID;
ALTER TABLE biz_housing_ledger_entry
  DROP CONSTRAINT biz_housing_ledger_entry_lease_id_fkey,
  DROP CONSTRAINT biz_housing_ledger_entry_receivable_id_fkey;
ALTER TABLE biz_housing_handover DROP CONSTRAINT biz_housing_handover_lease_id_fkey;
-- 000192/000198 already installed the replacement lease/receivable/purchase owner FKs.
ALTER TABLE biz_housing_purchase
  DROP CONSTRAINT biz_housing_purchase_unit_id_fkey,
  ADD CONSTRAINT fk_housing_purchase_unit_scope FOREIGN KEY (tenant_id,park_id,unit_id) REFERENCES biz_unit(tenant_id,park_id,id) NOT VALID;
ALTER TABLE biz_housing_purchase_item
  DROP CONSTRAINT biz_housing_purchase_item_purchase_id_fkey;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
   WHERE conname = ANY(ARRAY[
     'fk_homestay_rate_config_unit_scope','fk_homestay_rate_override_unit_scope',
     'fk_homestay_booking_unit_scope','fk_homestay_booking_party_scope','fk_homestay_booking_occupancy_scope',
     'fk_homestay_booking_night_booking_scope','fk_homestay_booking_guest_booking_scope',
     'fk_homestay_booking_guest_party_scope','fk_homestay_credential_booking_scope',
     'fk_homestay_turnover_booking_scope','fk_homestay_turnover_unit_scope',
     'fk_homestay_turnover_occupancy_scope','fk_homestay_action_booking_scope',
     'fk_housing_lease_unit_scope','fk_housing_lease_party_scope','fk_housing_lease_occupancy_scope',
     'fk_housing_occupant_lease_scope','fk_housing_occupant_party_scope',
     'fk_housing_receivable_charge_plan_scope','fk_housing_purchase_unit_scope'
   ])
  LOOP EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',item.table_name,item.conname); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION enforce_property_mvp_occupancy_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE occupancy_row biz_property_occupancy%ROWTYPE;
DECLARE booking_unit_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'biz_homestay_turnover_task' THEN
    SELECT unit_id INTO booking_unit_id FROM biz_homestay_booking
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
  SELECT * INTO occupancy_row FROM biz_property_occupancy
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

CREATE TRIGGER trg_homestay_booking_occupancy_owner
BEFORE INSERT OR UPDATE OF id,tenant_id,park_id,unit_id,occupancy_id ON biz_homestay_booking
FOR EACH ROW EXECUTE FUNCTION enforce_property_mvp_occupancy_owner();
CREATE TRIGGER trg_homestay_turnover_occupancy_owner
BEFORE INSERT OR UPDATE OF id,tenant_id,park_id,booking_id,unit_id,occupancy_id ON biz_homestay_turnover_task
FOR EACH ROW EXECUTE FUNCTION enforce_property_mvp_occupancy_owner();
CREATE TRIGGER trg_housing_lease_occupancy_owner
BEFORE INSERT OR UPDATE OF id,tenant_id,park_id,unit_id,occupancy_id ON biz_housing_lease
FOR EACH ROW EXECUTE FUNCTION enforce_property_mvp_occupancy_owner();

CREATE OR REPLACE FUNCTION enforce_property_mvp_occupancy_reverse_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_deleted AND NOT OLD.is_deleted AND (
    EXISTS (SELECT 1 FROM biz_homestay_booking owner WHERE owner.occupancy_id=OLD.id)
    OR EXISTS (SELECT 1 FROM biz_homestay_turnover_task owner WHERE owner.occupancy_id=OLD.id)
    OR EXISTS (SELECT 1 FROM biz_housing_lease owner WHERE owner.occupancy_id=OLD.id)
  ) THEN
    RAISE EXCEPTION 'linked property occupancy cannot be soft-deleted' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM biz_homestay_booking owner
     WHERE owner.occupancy_id=OLD.id
       AND (owner.tenant_id,owner.park_id,owner.unit_id,'homestay','homestay_booking',owner.id::text)
         IS DISTINCT FROM (NEW.tenant_id,NEW.park_id,NEW.unit_id,NEW.source_domain,NEW.source_type,NEW.source_id)
  ) THEN
    RAISE EXCEPTION 'homestay booking occupancy reverse owner mismatch' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM biz_homestay_turnover_task owner
     WHERE owner.occupancy_id=OLD.id
       AND (owner.tenant_id,owner.park_id,owner.unit_id,'operations','homestay_turnover',owner.id::text)
         IS DISTINCT FROM (NEW.tenant_id,NEW.park_id,NEW.unit_id,NEW.source_domain,NEW.source_type,NEW.source_id)
  ) THEN
    RAISE EXCEPTION 'homestay turnover occupancy reverse owner mismatch' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM biz_housing_lease owner
     WHERE owner.occupancy_id=OLD.id
       AND (owner.tenant_id,owner.park_id,owner.unit_id,'housing_rental','housing_lease',owner.id::text)
         IS DISTINCT FROM (NEW.tenant_id,NEW.park_id,NEW.unit_id,NEW.source_domain,NEW.source_type,NEW.source_id)
  ) THEN
    RAISE EXCEPTION 'housing lease occupancy reverse owner mismatch' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_property_occupancy_reverse_owner
BEFORE UPDATE OF id,tenant_id,park_id,unit_id,source_domain,source_type,source_id,is_deleted
ON biz_property_occupancy
FOR EACH ROW EXECUTE FUNCTION enforce_property_mvp_occupancy_reverse_owner();

COMMIT;
