# Production Seeds

Production seeds must never create fixed-password accounts or demo business data.

Run them explicitly with:

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
```

Current production-safe seed files:

- `../000001_s1_permissions.sql`

The development account seed `../000002_s1_dev_accounts.sql` is intentionally excluded.
