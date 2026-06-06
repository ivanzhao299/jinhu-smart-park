CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS sys_idempotency_request (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(32) NOT NULL,
  park_id varchar(32) NOT NULL,
  user_id varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_method varchar(10) NOT NULL,
  request_path varchar(255) NOT NULL,
  request_fingerprint varchar(128) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'processing',
  response_status integer,
  response_body jsonb,
  error_code varchar(64),
  locked_until timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sys_idempotency_request_scope UNIQUE (tenant_id, user_id, request_path, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sys_idempotency_request_expires_at
  ON sys_idempotency_request (expires_at);

CREATE INDEX IF NOT EXISTS idx_sys_idempotency_request_status_locked_until
  ON sys_idempotency_request (status, locked_until);
