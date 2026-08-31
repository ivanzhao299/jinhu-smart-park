BEGIN;

ALTER TABLE public.biz_party
  ADD COLUMN IF NOT EXISTS identity_number_encryption_key_id varchar(128);

UPDATE public.biz_party
SET identity_number_encryption_key_id = 'party-data-v1'
WHERE identity_number_encrypted IS NOT NULL
  AND identity_number_encryption_key_id IS NULL;

ALTER TABLE public.biz_party
  DROP CONSTRAINT IF EXISTS ck_biz_party_identity_encryption_key_metadata;

ALTER TABLE public.biz_party
  ADD CONSTRAINT ck_biz_party_identity_encryption_key_metadata CHECK (
    (identity_number_encrypted IS NULL AND identity_number_encryption_key_id IS NULL)
    OR
    (
      identity_number_encrypted IS NOT NULL
      AND identity_number_encryption_key_id IS NOT NULL
      AND length(btrim(identity_number_encryption_key_id)) BETWEEN 1 AND 128
      AND identity_number_encryption_key_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    )
  );

ALTER TABLE public.biz_party_identity_snapshot
  DROP CONSTRAINT IF EXISTS ck_party_identity_snapshot_encryption_key_id_format;
ALTER TABLE public.biz_party_identity_snapshot
  ADD CONSTRAINT ck_party_identity_snapshot_encryption_key_id_format CHECK (
    encryption_key_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ) NOT VALID;

ALTER TABLE public.biz_party_identity_submission
  DROP CONSTRAINT IF EXISTS ck_party_identity_submission_draft_key_id_format;
ALTER TABLE public.biz_party_identity_submission
  ADD CONSTRAINT ck_party_identity_submission_draft_key_id_format CHECK (
    draft_encryption_key_id IS NULL
    OR draft_encryption_key_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ) NOT VALID;

COMMENT ON COLUMN public.biz_party.identity_number_encryption_key_id IS
  'Party identity ciphertext key id. Existing application-written ciphertext is attributed to party-data-v1; decryptability is verified per tenant during rotation inventory.';

CREATE TABLE IF NOT EXISTS public.biz_party_data_key_rotation_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(50) NOT NULL,
  park_id varchar(50) NOT NULL,
  request_key varchar(128) NOT NULL,
  active_key_id varchar(128) NOT NULL,
  party_count integer NOT NULL DEFAULT 0,
  snapshot_count integer NOT NULL DEFAULT 0,
  draft_count integer NOT NULL DEFAULT 0,
  actor_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_party_data_key_rotation_receipt_scope_request
    UNIQUE (tenant_id, park_id, request_key),
  CONSTRAINT ck_party_data_key_rotation_receipt_key_id
    CHECK (active_key_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  CONSTRAINT ck_party_data_key_rotation_receipt_counts
    CHECK (party_count >= 0 AND snapshot_count >= 0 AND draft_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_party_data_key_rotation_receipt_scope_completed
  ON public.biz_party_data_key_rotation_receipt(tenant_id, park_id, completed_at DESC);

COMMENT ON TABLE public.biz_party_data_key_rotation_receipt IS
  'Idempotent per-tenant/park Party ciphertext rotation receipts. Contains key ids and counts only, never key material, plaintext, ciphertext, or hashes.';

COMMIT;
