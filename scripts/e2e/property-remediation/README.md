# Property remediation database fixtures

`track-a-rbac-migration.mjs` directly executes migration `000183` twice against an
isolated PostgreSQL database and then removes its random fixture rows.

The script refuses non-loopback hosts, connection-override query parameters,
unsupported database-name characters, and database names that do not contain
`test`, `fixture`, or `ci`. Run it only after the database has been migrated
through `000182`:

```bash
PROPERTY_RBAC_FIXTURE_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/jinhu_fixture \
PROPERTY_RBAC_FIXTURE_ALLOW_WRITE=yes \
node scripts/e2e/property-remediation/track-a-rbac-migration.mjs
```

When the host does not have `psql`, create a new disposable PostgreSQL container
for one fixture run. The fallback verifies the exact run ID and container name,
the two fixture labels, `--rm`, the official PostgreSQL image, `POSTGRES_DB`,
and anonymous temporary storage before it executes any SQL:

```bash
fixture_run_id=20260730_f7c2a9b8
fixture_container="pr192_track_a_rbac_fixture_${fixture_run_id}_db"

docker run --detach --rm \
  --name "${fixture_container}" \
  --label com.jinhu.fixture=pr192-track-a-rbac \
  --label "com.jinhu.fixture.run-id=${fixture_run_id}" \
  --env POSTGRES_USER=user \
  --env POSTGRES_PASSWORD=password \
  --env POSTGRES_DB=jinhu_fixture \
  postgres:16-alpine

# Wait for PostgreSQL, then initialize this disposable database through 000182
# using the repository migration procedure before executing the fixture.

PROPERTY_RBAC_FIXTURE_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/jinhu_fixture \
PROPERTY_RBAC_FIXTURE_ALLOW_WRITE=yes \
PROPERTY_RBAC_FIXTURE_PSQL_CONTAINER="${fixture_container}" \
PROPERTY_RBAC_FIXTURE_CONTAINER_RUN_ID="${fixture_run_id}" \
node scripts/e2e/property-remediation/track-a-rbac-migration.mjs

docker stop "${fixture_container}"
```

Without `PROPERTY_RBAC_FIXTURE_DATABASE_URL`, the script exits successfully with
an explicit `[SKIP]` reason and performs no database writes.
