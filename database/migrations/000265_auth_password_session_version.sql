BEGIN;

ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 1;

ALTER TABLE sys_user
  DROP CONSTRAINT IF EXISTS ck_sys_user_auth_version;

ALTER TABLE sys_user
  ADD CONSTRAINT ck_sys_user_auth_version CHECK (auth_version >= 1);

COMMIT;
