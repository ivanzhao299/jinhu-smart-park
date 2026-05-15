# Development Seeds

Development seeds may create local test users, fixed passwords, and sample data used by smoke tests.

Run them with:

```bash
pnpm db:seed:dev
```

Current development-only seed files:

- `../000001_s1_production_core.sql`
- `../000002_dev_only_s1_accounts.sql`

The development-only account seed also initializes S2 local test assets:

- S2-02 buildings: `JH-B01`, `JH-B02`, `JH-B03`
- S2-03 floors: `JH-B01-F01`, `JH-B01-F02`, `JH-B01-F03`, `JH-B02-F01`, `JH-B02-F02`
- S2-04 units: `JH-B01-F01-R0101`, `JH-B01-F01-R0102`, `JH-B01-F02-R0201`, `JH-B01-F03-R0301`, `JH-B02-F01-R0101`

Do not run development seeds in shared, staging, or production databases.
