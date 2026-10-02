BEGIN;
-- Modern definitions only. No historical facts, role grants or activation are changed.
CREATE FUNCTION hr_insurance_version_factors_valid(p_items jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; factor jsonb; component text; kinds text[] := ARRAY[]::text[];
  rate_text text; fixed_text text;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)<>6 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR item->>'insuranceKind' IS NULL
      OR item->>'insuranceKind' NOT IN ('oldage','remedy','losework','wound','bear','fund')
      OR item->>'insuranceKind'=ANY(kinds)
      OR jsonb_typeof(item->'factors') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    kinds:=array_append(kinds,item->>'insuranceKind');
    FOREACH component IN ARRAY ARRAY['base','employer','employee','supplement'] LOOP
      factor:=item->'factors'->component;
      IF jsonb_typeof(factor) IS DISTINCT FROM 'object'
        OR jsonb_typeof(factor->'rate') IS DISTINCT FROM 'string'
        OR NOT (factor ? 'fixedAmount') THEN RETURN false; END IF;
      rate_text:=factor->>'rate'; fixed_text:=factor->>'fixedAmount';
      IF rate_text !~ '^[0-9]{1,12}\.[0-9]{6}$'
        OR (jsonb_typeof(factor->'fixedAmount') IS DISTINCT FROM 'null'
          AND (jsonb_typeof(factor->'fixedAmount') IS DISTINCT FROM 'string'
            OR fixed_text !~ '^-?[0-9]{1,15}\.[0-9]{3}$')) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;

CREATE TABLE hr_insurance_policy_version (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  request_id uuid NOT NULL, request_sha256 char(64) NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  policy_code varchar(64) NOT NULL CHECK(policy_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  policy_name varchar(200) NOT NULL CHECK(length(btrim(policy_name)) BETWEEN 1 AND 200),
  variant_no smallint NOT NULL CHECK(variant_no IN (1,2)),
  version_no integer NOT NULL CHECK(version_no>0),
  effective_from date NOT NULL, effective_through date NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  definition jsonb NOT NULL,
  source_policy_id uuid GENERATED ALWAYS AS ((definition->'origin'->>'policyId')::uuid) STORED
    REFERENCES hr_insurance_policy(id),
  definition_sha256 text GENERATED ALWAYS AS (encode(digest(definition::text,'sha256'),'hex')) STORED,
  UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,request_id),
  UNIQUE(tenant_id,park_id,policy_code,variant_no,version_no),
  CHECK(effective_from BETWEEN date '1900-01-01' AND date '2100-12-01'
    AND effective_through BETWEEN effective_from AND date '2100-12-01'
    AND extract(day FROM effective_from)=1 AND extract(day FROM effective_through)=1),
  CHECK(jsonb_typeof(definition) IS NOT DISTINCT FROM 'object'
    AND definition->>'formatVersion' IS NOT DISTINCT FROM '1'
    AND definition->>'engineVersion' IS NOT DISTINCT FROM 'jinhu-insurance-decimal-v1'
    AND definition->>'tenantId' IS NOT DISTINCT FROM tenant_id::text
    AND definition->>'parkId' IS NOT DISTINCT FROM park_id::text
    AND definition->>'policyCode' IS NOT DISTINCT FROM policy_code::text
    AND definition->>'policyName' IS NOT DISTINCT FROM policy_name::text
    AND definition->>'variantNo' IS NOT DISTINCT FROM variant_no::text
    AND definition->>'versionNo' IS NOT DISTINCT FROM version_no::text
    AND definition->>'effectiveFrom' IS NOT DISTINCT FROM to_char(effective_from,'YYYY-MM')
    AND definition->>'effectiveThrough' IS NOT DISTINCT FROM to_char(effective_through,'YYYY-MM')
    AND definition->>'createdBy' IS NOT DISTINCT FROM created_by::text
    AND jsonb_typeof(definition->'reason') IS NOT DISTINCT FROM 'string'
    AND length(btrim(definition->>'reason')) BETWEEN 1 AND 500
    AND jsonb_typeof(definition->'origin') IS NOT DISTINCT FROM 'object'
    AND COALESCE(definition->'origin'->>'kind' IN ('manual','imported_reference'),false)
    AND CASE WHEN definition->'origin'->>'kind'='imported_reference' THEN
      COALESCE(jsonb_typeof(definition->'origin'->'policyId')='string'
        AND definition->'origin'->>'policyId' ~ '^[0-9a-f-]{36}$'
        AND jsonb_typeof(definition->'origin'->'policyVersion')='number'
        AND definition->'origin'->>'policyVersion' ~ '^[1-9][0-9]{0,9}$'
        AND definition->'origin'->>'variantNo'=variant_no::text
        AND definition->'origin'->>'factorsHash' ~ '^[0-9a-f]{64}$',false)
      ELSE NOT (definition->'origin' ? 'policyId') END),
  CHECK(hr_insurance_version_factors_valid(definition->'items'))
);
CREATE INDEX idx_hr_insurance_policy_version_catalog
  ON hr_insurance_policy_version(tenant_id,park_id,policy_code,variant_no,version_no DESC);
CREATE FUNCTION hr_insurance_policy_version_source_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.definition->'origin'->>'kind'='imported_reference' THEN
    PERFORM 1 FROM public.hr_insurance_policy WHERE id=(NEW.definition->'origin'->>'policyId')::uuid
      AND tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND NOT is_deleted
      AND version::text=NEW.definition->'origin'->>'policyVersion' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'HR_INSURANCE_POLICY_VERSION_SOURCE_SCOPE_OR_VERSION'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_insurance_policy_version_source_guard BEFORE INSERT
  ON hr_insurance_policy_version FOR EACH ROW EXECUTE FUNCTION hr_insurance_policy_version_source_guard();
CREATE FUNCTION hr_insurance_policy_version_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'HR_INSURANCE_POLICY_VERSION_IMMUTABLE'; END $$;
CREATE TRIGGER trg_hr_insurance_policy_version_immutable BEFORE UPDATE OR DELETE
  ON hr_insurance_policy_version FOR EACH ROW EXECUTE FUNCTION hr_insurance_policy_version_immutable();
CREATE TRIGGER trg_hr_insurance_policy_version_no_truncate BEFORE TRUNCATE
  ON hr_insurance_policy_version FOR EACH STATEMENT EXECUTE FUNCTION hr_insurance_policy_version_immutable();
REVOKE ALL ON hr_insurance_policy_version FROM PUBLIC;
COMMENT ON TABLE hr_insurance_policy_version IS 'Immutable modern policy definitions; explicit period selection and separate confirmation required. Overlapping version ranges do not imply automatic latest-version selection.';
COMMIT;
