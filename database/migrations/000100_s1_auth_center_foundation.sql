CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sys_user_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  user_id uuid NOT NULL,
  provider varchar(32) NOT NULL,
  provider_user_id varchar(191) NOT NULL,
  provider_union_id varchar(191),
  mobile varchar(32),
  email varchar(128),
  nickname varchar(100),
  avatar_url varchar(500),
  raw_profile_json jsonb,
  bind_status varchar(32) NOT NULL DEFAULT 'bound',
  last_login_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_sys_user_identity_user
  ON sys_user_identity (tenant_id, park_id, user_id, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_identity_provider_user_active
  ON sys_user_identity (tenant_id, park_id, provider, provider_user_id)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_identity_user_provider_active
  ON sys_user_identity (tenant_id, park_id, user_id, provider)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS sys_auth_refresh_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  user_id uuid NOT NULL,
  token_hash varchar(128) NOT NULL,
  device_id varchar(128),
  user_agent varchar(500),
  ip_address varchar(64),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  revoked_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_auth_refresh_token_hash
  ON sys_auth_refresh_token (token_hash);

CREATE INDEX IF NOT EXISTS idx_sys_auth_refresh_token_user
  ON sys_auth_refresh_token (tenant_id, park_id, user_id, revoked, is_deleted);

CREATE TABLE IF NOT EXISTS sys_auth_otp_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64),
  mobile varchar(32) NOT NULL,
  scene varchar(32) NOT NULL DEFAULT 'login',
  code_hash varchar(128) NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_time timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  ip_address varchar(64),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_sys_auth_otp_code_lookup
  ON sys_auth_otp_code (tenant_id, mobile, scene, used, expires_at, is_deleted);

CREATE TABLE IF NOT EXISTS sys_auth_oauth_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64),
  park_id varchar(64),
  provider varchar(32) NOT NULL,
  state varchar(191) NOT NULL,
  redirect_uri varchar(500),
  context_json jsonb,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  consumed_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_auth_oauth_state
  ON sys_auth_oauth_state (provider, state);

CREATE TABLE IF NOT EXISTS sys_auth_login_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  provider varchar(32) NOT NULL,
  ticket varchar(191) NOT NULL,
  context_payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_auth_login_ticket
  ON sys_auth_login_ticket (ticket);

CREATE TABLE IF NOT EXISTS sys_auth_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64),
  allow_password_login boolean NOT NULL DEFAULT true,
  allow_mobile_login boolean NOT NULL DEFAULT true,
  allow_wechat_open_login boolean NOT NULL DEFAULT false,
  allow_wechat_mp_login boolean NOT NULL DEFAULT false,
  require_bound_identity boolean NOT NULL DEFAULT true,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_auth_policy_scope_active
  ON sys_auth_policy (tenant_id, COALESCE(park_id, ''))
  WHERE is_deleted = false;

INSERT INTO sys_user_identity (
  tenant_id, park_id, user_id, provider, provider_user_id, mobile, email, nickname, avatar_url,
  bind_status, create_time, update_time, is_deleted, version, remark
)
SELECT
  u.tenant_id, u.park_id, u.id, 'password', u.username, u.mobile, u.email, u.display_name, u.avatar_url,
  'bound', now(), now(), false, 1, 'Backfilled from existing sys_user password account'
FROM sys_user u
WHERE u.is_deleted = false
  AND NOT EXISTS (
    SELECT 1
    FROM sys_user_identity i
    WHERE i.tenant_id = u.tenant_id
      AND i.park_id = u.park_id
      AND i.provider = 'password'
      AND i.provider_user_id = u.username
      AND i.is_deleted = false
  );

WITH mobile_candidates AS (
  SELECT DISTINCT ON (u.tenant_id, u.park_id, u.mobile)
    u.tenant_id, u.park_id, u.id, u.mobile, u.email, u.display_name, u.avatar_url
  FROM sys_user u
  WHERE u.is_deleted = false
    AND u.mobile IS NOT NULL
    AND btrim(u.mobile) <> ''
  ORDER BY u.tenant_id, u.park_id, u.mobile, u.create_time ASC
)
INSERT INTO sys_user_identity (
  tenant_id, park_id, user_id, provider, provider_user_id, mobile, email, nickname, avatar_url,
  bind_status, create_time, update_time, is_deleted, version, remark
)
SELECT
  c.tenant_id, c.park_id, c.id, 'mobile', c.mobile, c.mobile, c.email, c.display_name, c.avatar_url,
  'bound', now(), now(), false, 1, 'Backfilled from existing sys_user mobile'
FROM mobile_candidates c
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_user_identity i
  WHERE i.tenant_id = c.tenant_id
    AND i.park_id = c.park_id
    AND i.provider = 'mobile'
    AND i.provider_user_id = c.mobile
    AND i.is_deleted = false
);
