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

## A-ephemeral-db-bootstrap

`bootstrap/run-ephemeral-db-bootstrap.mjs` creates and owns one exact disposable
PostgreSQL target. It accepts only a lowercase 12–64 character run ID and
rejects database URL overrides. The runner itself fixes the container name,
official PostgreSQL image, database name, two labels, random loopback port,
`--rm`, and anonymous data volume.

It applies `000001`–`000174`, validates the reviewed checksum and expected
transaction rollback of the production-only `000175` data patch, records
`000175` as a structured skip, then applies `000176`–`000183`. One JSON evidence
record is written to stdout; progress is written to stderr. The evidence
contains the stable bootstrap SHA, redacted Docker command, every applied or
skipped migration checksum, and exact container/anonymous-volume cleanup proof.

The migration numbering contract is frozen: `000001`–`000174` are singletons
except for the two reviewed `000136` files, `000175` has an exact filename and
checksum, and `000176`–`000183` are singletons. Readiness requires the official
entrypoint completion marker followed by three consecutive `pg_isready` plus
`SELECT 1` probes over a stable window. `SIGINT` and `SIGTERM` cancel the active
Docker/psql child, stop subsequent migrations, wait for the child to exit, then
clean the exact container and anonymous volume. Cleanup errors remain in the
final JSON and always make the run fail.

```bash
PROPERTY_EPHEMERAL_DB_RUN_ID=bootstrap20260730a1 \
node scripts/e2e/property-remediation/bootstrap/run-ephemeral-db-bootstrap.mjs
```

Run static tests without Docker:

```bash
node --test \
  scripts/e2e/property-remediation/bootstrap/ephemeral-db-bootstrap.spec.mjs
```

The opt-in runtime suite covers invalid Docker stdout recovery, injected
migration failure, real signal cancellation, cleanup-error evidence, and two
complete bootstraps using the same run ID to prove repeatability and cleanup.

```bash
PROPERTY_EPHEMERAL_DB_RUNTIME_TEST=yes \
node --test \
  scripts/e2e/property-remediation/bootstrap/ephemeral-db-bootstrap.spec.mjs
```

Windows does not deliver `child.kill("SIGTERM")` to a Node signal handler, so
that one case is skipped on Windows. Its Linux proof uses an OS-level SIGTERM
and the repository's temporary fake-Docker child-process harness; it does not
mount the host Docker socket. The real PostgreSQL runtime cases continue to
cover readiness, migration failure, cleanup errors, and repeated full chains.
