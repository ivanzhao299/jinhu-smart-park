# Property remediation database fixtures

`track-a-rbac-migration.mjs` is the reproducible A-2.5 database gate. It creates
and owns one exact disposable PostgreSQL 16 Alpine container, applies the
migration chain through `000182` (with the reviewed `000175` production-data
patch skipped), and then proves:

- `000183` creates the exact 65-permission baseline;
- `000184` adds exactly seven read permissions for a combined set of 72;
- the 14 bundles contain exactly 59 literal pairs and each new read permission
  has one bundle owner;
- the actual built-in grants equal the fixture's expected three-row set, so an
  empty or incomplete grant insert fails the gate;
- disabled, expired, status-disabled and missing module assignments receive no
  new permissions;
- custom, legacy and wildcard grants remain unchanged and cross-scope grants
  remain zero;
- `asset:party` is hidden, parented to `asset`, and receives no automatic grant;
- the second `000184` run leaves definition and grant timestamps unchanged;
- `000184` first creates the Party page in the fixed production seed scope, and
  two production-safe seed runs preserve that same row ID, content, parent,
  hidden state and zero-grant state.

The runner rejects every database URL override and accepts only a unique
lowercase 12–64 character run ID. It verifies the exact container name, two
fixture labels, running state, official image, `--rm`, explicit `POSTGRES_DB`,
random loopback port and Docker-created anonymous volume. Its `finally` path
removes the exact container and anonymous volume on both success and failure.

Run from the repository root. The single stdout line is the machine-readable
evidence summary; progress is written to stderr:

```bash
set -o pipefail
mkdir -p artifacts/property-remediation
PROPERTY_RBAC_FIXTURE_RUN_ID=a25rbac20260731a1 \
node scripts/e2e/property-remediation/track-a-rbac-migration.mjs \
  | tee artifacts/property-remediation/a25-rbac-evidence.json
```

The evidence is successful only when `status="passed"`,
`open_P0_P1=[]`, and cleanup reports both
`container_absent=true` and `anonymous_volume_absent=true`. Generated evidence
under `artifacts/property-remediation/` is runtime output and must not be
committed.

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

## A-base-core

`a-base-core.mjs` provisions the immutable
`property-remediation-a-base-v1` profile for Track A. It creates two separate,
exactly identified PostgreSQL 16 Alpine containers and proves that both runs
produce the same canonical profile checksum. It never accepts a database URL
and never connects to an existing database. Every database container uses
`--rm`, the two reviewed fixture labels, an explicit test database, a random
loopback port and a Docker-created anonymous data volume.

The profile uses a fixed seed, `Asia/Shanghai` business clock and UUIDv5 keys.
It creates the reviewed exact counts and 60/30/10 park distribution, including
6,500 shared occupancy rows and 2,000 small valid PNG files associated with
same-scope housing handovers. Track B tables are neither required nor written.
Rows are loaded with bounded transactional `COPY` chunks under a PostgreSQL
advisory transaction lock.

Before any resource write, the runner appends `planned` to a durable JSONL
journal, calls `fsync`, and then records
`creating -> created -> cleanup_pending -> cleaned|failed`. Each event is
linked to the previous event by SHA-256. Cleanup deletes only deterministic
primary keys in reverse dependency order; it never uses `LIKE`, a date range,
or a tenant-wide delete. Physical files are also removed by their exact
journaled paths. Summary, evidence and handoff files use fsync plus atomic
rename and are written only below the ignored
`artifacts/property-remediation/runs/<run-id>/` directory.

Run the pure contract suite:

```bash
node scripts/e2e/property-remediation/tests/a-base-contract.spec.mjs
```

Run the real isolated double provision:

```bash
PROPERTY_A_BASE_RUN_ID=abase20260730example \
node scripts/e2e/property-remediation/a-base-core.mjs
```

If an uncatchable process crash leaves a journaled run unfinished, replay only
that exact run ID. Reconcile validates the exact container name, image,
database and two labels before it touches the container, removes only
journaled files and deterministic database keys, and recovers a stale PID lock
only when `/proc/<pid>` no longer exists:

```bash
PROPERTY_A_BASE_RUN_ID=abase20260730example \
PROPERTY_A_BASE_RECONCILE_ONLY=yes \
node scripts/e2e/property-remediation/a-base-core.mjs
```

The opt-in runtime test source covers normal double provision, injected file
creation and cleanup failures, `SIGINT`, `SIGTERM`, `SIGKILL`, same-run
reconcile and zero residual. It is intentionally not part of ordinary unit
tests because it creates multiple isolated PostgreSQL containers:

```bash
PROPERTY_A_BASE_RUNTIME_TEST=yes \
node scripts/e2e/property-remediation/tests/a-base-runtime.spec.mjs
```

Performance data emitted by A-base is candidate observation only. It cannot
turn a gate green until an owner, approver and approval date freeze a separate
threshold contract.
