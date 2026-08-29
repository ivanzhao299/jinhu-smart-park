-- Persist the rental-status projection outcome in the immutable housing checkout effect audit.
ALTER TABLE biz_housing_lease_effect_audit
  ADD COLUMN rental_status_projection jsonb;

ALTER TABLE biz_housing_lease_effect_audit
  ADD CONSTRAINT ck_housing_lease_effect_audit_rental_status_projection
  CHECK (
    rental_status_projection IS NULL
    OR (
      jsonb_typeof(rental_status_projection) = 'object'
      AND rental_status_projection ?& ARRAY['disposition','beforeStatus','afterStatus']
    )
  );
