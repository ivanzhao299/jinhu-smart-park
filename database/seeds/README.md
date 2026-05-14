# Seeds

Place environment-specific seed scripts here. Do not commit real passwords or production secrets.

Seed execution is intentionally split:

- Development: `pnpm db:seed:dev`
- Production-safe: `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`

The production seed command only applies permission metadata and excludes local test accounts.

## S1

- `000001_s1_permissions.sql` initializes S1 system permission points for a default tenant and park, including organization, users, roles, permissions, dictionaries, attachments, files, and audit logs.
- `000002_s1_dev_accounts.sql` creates local-only S1 self-test accounts:
  - `admin` / `Jinhu@123456`
  - `s1_user` / `Jinhu@123456`
- Before running it in a real environment, replace the `tenant_id` and `park_id` values in `seed_scope`.
- Do not run the development account seed in shared, staging, or production environments.
