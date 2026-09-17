# Target inventory diagnostic failures

The read-only host probe distinguishes SQL execution from local materialization
with fixed stage failure markers. It preserves only the six exact stable codes
emitted by the materializer: input, scope, record, duplicate, generic failure and
argument errors. Multiline diagnostics, appended values and unknown diagnostics
remain redacted to the generic probe failure code. Existing database authentication,
connection, permission and missing-schema classifications remain unchanged.

The T0-T3 inventory workflow accepts optional `target_scope_sha256`, taken from
the previously approved target scope, not inferred from whichever row is first.
The host script forwards this as its third argument to the SQL generator.
Only lowercase 64-character hexadecimal hashes are accepted before SSH and SQL.
The generator hashes canonical tenant/park business keys using UTF-8 bytea and
NUL delimiters, matching the existing scope-hash contract without pgcrypto.
It filters active validated scopes before the exact-one check. All target-table
joins remain tenant AND park scoped; other scopes are neither read into the
inventory nor changed. The workflow verifies the returned scope hash.

Without a selector, the original unique-scope behavior remains. Missing,
disabled, expired or ambiguous targets fail closed; an empty query result now
returns the stable scope-invalid code instead of a generic JSON parsing error.
This is read-only selection, not an allowlist update or production import
authorization. Raw target rows and database error details must never be printed.

Validate with `sh -n scripts/diagnose-yuzhou-hr-production-target-inventory.sh`
and `node scripts/e2e/yuzhou-production-target-inventory-contract.mjs`.
The contract executes the shell classifier for every permitted code and checks
that added private fixture text is not returned.

Run `node scripts/e2e/yuzhou-production-target-scope-postgres.mjs` with local
PostgreSQL binaries on PATH (or `YUZHOU_SCOPE_POSTGRES_BIN`). It creates a private
temporary cluster with TCP disabled, tests three synthetic active scopes,
wrong hashes, disabled assignments and expired tenants, then stops and removes
only that cluster. No existing database, Docker volume or source data is used.
