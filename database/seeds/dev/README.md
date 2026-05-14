# Development Seeds

Development seeds may create local test users, fixed passwords, and sample data used by smoke tests.

Run them with:

```bash
pnpm db:seed:dev
```

Current development-only seed files:

- `../000001_s1_permissions.sql`
- `../000002_s1_dev_accounts.sql`

Do not run development seeds in shared, staging, or production databases.
