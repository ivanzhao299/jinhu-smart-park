# Target inventory diagnostic failures

The read-only host probe distinguishes SQL execution from local materialization
with fixed stage failure markers. It preserves only the six exact stable codes
emitted by the materializer: input, scope, record, duplicate, generic failure and
argument errors. Multiline diagnostics, appended values and unknown diagnostics
remain redacted to the generic probe failure code. Existing database authentication,
connection, permission and missing-schema classifications remain unchanged.

No SQL, business mapping, target validation, or production authorization is changed.
Raw target rows and database error details must never be printed.

Validate with `sh -n scripts/diagnose-yuzhou-hr-production-target-inventory.sh`
and `node scripts/e2e/yuzhou-production-target-inventory-contract.mjs`.
The contract executes the shell classifier for every permitted code and checks
that added private fixture text is not returned.
