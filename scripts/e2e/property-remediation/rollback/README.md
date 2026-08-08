# Track C rollback service-restoration rehearsal

This directory contains the fail-closed infrastructure for the PR192 Track C
rollback rehearsal. It defines 17 backend closure cases and two grouped
frontend cases. It contains no reviewed rollback patches and a successful
configuration check is not evidence that a formal rehearsal ran.

## Trust boundary

Formal evidence is bound to the clean final commit, frozen profile, reviewed
patch and plan, exact runner/toolchain component hashes, a runner nonce, and a
hash-chained execution transcript. The gate also re-hashes every log and
artifact. These controls detect accidental drift, splicing, incomplete mock
fixtures, and ordinary manual editing. They do not make evidence
cryptographically unforgeable by a malicious user with write access to the
repository and evidence root; independent review of inputs, transcript, logs,
and cleanup remains mandatory.

`test-harness.mjs` emits only `TEST_ONLY` provenance. The formal gate rejects
it even when its fixture covers all 19 cases.

## Per-case lifecycle

The runner owns the complete lifecycle and never reuses a development Web/API
service or database:

1. Create an exact sparse detached worktree at the final SHA.
2. Run the absolute Corepack pnpm JavaScript CLI at exactly pnpm 9.12.0 with
   `install --offline --frozen-lockfile`; validate TypeScript, ts-node and Next
   realpaths against the worktree's trusted pnpm virtual store.
3. Verify the declared source dataset profile and 18-table PostgreSQL SHA-256
   projection. All-zero data and empty approval, finance, or occupancy
   sentinels fail closed.
4. Clone the source database to the authority-owned case database and verify
   that its projection is identical. Administration credentials are used for
   create/drop; all application, test and snapshot connections are bound to
   the generated case database and verify `current_database()`.
5. At the unmodified final SHA, build API and flags-on Web artifacts, start
   isolated services on authority ports, require API health and readiness 200,
   perform a real administrator login through the Web rewrite, and read the
   homestay and housing dashboards through that same Web origin. Stop the
   complete service process groups and verify both ports are free.
6. Start one shared 30-minute hard deadline, apply the independently reviewed
   manual forward-port rollback patch, and derive/verify its result tree from
   the frozen final tree. The original reverse diff is frozen only as closure
   intent: many historical reverse patches no longer apply cleanly. Metadata
   must bind that original hash, the effective manual patch hash, and a
   per-file deviation manifest (`action`, `reason`, immutable invariant/gate
   IDs, and a contract anchor ID). Patch metadata schema v2 requires distinct
   author and reviewer identities. Test/spec, migration, Trellis, e2e,
   canonical contract, PostgreSQL gate and protected external paths are
   immutable. Retained compatibility shells and facade reroutes must be
   declared; undeclared, comment-only, out-of-owner or blind-revert patches
   fail. A runner-owned semantic gate then checks exact/regex and structured
   TypeScript import, class, provider, constructor, call, awaited-call and
   export anchors, explicit file presence/deletion, immutable-test glob
   expansion and before/after blob hashes. Its inputs and result are bound into
   the transcript and recomputed by the final gate.
   then run API build, Web typecheck, clean flags-off production build,
   contract, canonical-port, targeted, and five-file PostgreSQL gates.
7. Read `.next/required-server-files.json` and require both normalized public
   flags to be the string `"false"`; bind `BUILD_ID`, artifact SHA-256, and the
   exact authority API destination from `routes-manifest.json`.
8. Start the rolled-back services and repeat authenticated health, readiness,
   login, homestay, and housing smoke. This is the service-restoration point,
   not a second separate "recovery" phase. Stop RTO only after that smoke
   passes and the service process groups and ports return to zero.
9. Capture the post-smoke durable projection and require RPO=0. Cleanup again
   independently enumerates authority process groups, ports, Docker labels,
   database, worktree, temp files, and credential file; every residual must be
   zero.

Every Git/process/Docker/PostgreSQL operation has a hard timeout or shared
abort signal. SIGINT/SIGTERM still enter best-effort cleanup. Cleanup refuses
symlink targets before deletion. The runner validates every path component of
the run root, inputs, cases, worktrees, temp and secrets trees before its first
case mutation.

Before either service is spawned, the parent writes an authority-bound
`PENDING` runtime lease. Each detached process-group leader is atomically added
after spawn. Cleanup also scans `/proc` for the exact run/case/runtime nonce,
executable, working directory, role, command marker, and PGID, so interruption
between spawn and manifest update is recoverable. An unverifiable or malicious
PID is never killed; cleanup fails closed instead.

## Generate the source profile

Create the mode-0600 credential file with at least `adminDatabaseUrl` and
`sourceDatabase`, then run the read-only profiler. The database URL remains in
the file and never appears in argv or output:

```bash
chmod 600 <credential.json>
node scripts/e2e/property-remediation/rollback/source-profile.mjs \
  --credential-file <credential.json>
```

Copy the returned non-secret `profileId` and `tablesSha256` into
`sourceDatasetProfileId` and `sourceDatasetSha256` of the formal credential.
Review the returned counts and required sentinels before approval.

## Secret authority file

For each case, write strict JSON to
`secrets/<case>.database-url` with mode 0600:

```json
{
  "adminDatabaseUrl": "<PostgreSQL administration URL>",
  "sourceDatabase": "<frozen source database>",
  "sourceDatasetProfileId": "pr192-property-uat-v1",
  "sourceDatasetSha256": "<64 lowercase hex table-projection SHA-256>",
  "jwtSecret": "<at least 32 characters>",
  "partyDataEncryptionKey": "<at least 32 characters>",
  "adminUsername": "<source-dataset administrator>",
  "adminPassword": "<secret password>",
  "tenantId": "<tenant context>",
  "parkId": "<park context>"
}
```

The file, parsed URL components, login password, JWT secret, bearer token and
encryption key are never accepted in argv and never written to logs or
evidence. Child application configuration is built from the target URL as
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, and
`POSTGRES_PASSWORD`. Production auth mock variables are fixed to safe values.

## Commands

The default invocation runs the self-cleaning configuration/dry probe. It
creates and removes a sparse temporary worktree, performs the offline frozen
install, and runs API/Web `tsc --showConfig`, ts-node load, and Next production
config loading without a full build:

```bash
node scripts/e2e/property-remediation/rollback/runner.mjs --check
```

Prepare and execute require explicit mutation authorization:

```bash
PROPERTY_ROLLBACK_REHEARSAL=yes node \
  scripts/e2e/property-remediation/rollback/runner.mjs \
  --prepare --run-id rollback-YYYYMMDDTHHMMSSZ-<12-hex> \
  --final-sha <full-final-sha>

PROPERTY_ROLLBACK_REHEARSAL=yes node \
  scripts/e2e/property-remediation/rollback/runner.mjs \
  --execute --run-id <run-id> --final-sha <full-final-sha> \
  --case <case-id>
```

The independently approved plan remains data-only and has schema
`property-track-c-reviewed-rollback-plan-v3`; it binds run/final/profile/case,
patch metadata and runner-owned command-spec hashes, approver, review time, and
approval. The plan approver must differ from the patch reviewer. It cannot
supply commands, environment, snapshots, flags, cleanup, or expected Git
trees.

Until all 19 profile cases contain frozen `rollbackSemanticContract` entries,
formal `--check` and `--prepare` fail closed before running probes or creating a
run. Unit fixtures use an explicit unattested test schema/root and can never
produce formal PASS evidence.

After all 19 cases have formal PASS evidence:

```bash
node scripts/e2e/property-remediation/rollback/evidence-gate.mjs \
  --evidence-root <exact-run-root> --run-id <run-id> \
  --final-sha <full-final-sha>
```

Do not run the final gate against test fixtures or a partially completed run.
