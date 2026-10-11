# Payroll cohort insurance coverage diagnostic

`scripts/diagnose-hr-payroll-source-coverage.mjs` derives `insuranceCoverage` from
the same qualified monthly payroll facts, within one repeatable-read read-only
transaction. Fixed tenant/park, explicit first-of-month validation and timeouts
remain mandatory. All-source census totals must not silently become qualified-only.

Distinct eligible mapped employees with a live scoped employee are the cohort.
Preserve cross-book payroll records; only insurance option counting deduplicates
people. Historical source availability means exactly one active same-month period
and no review flag. Modern availability means exactly one latest same-month
revision with its scoped preview. Follow the actual calculation service query,
including not requiring modern close to offer a confirmed source.

The four availability categories partition the cohort. Additional review/missing/
ambiguity counters are diagnostic, may overlap where documented and never choose
a source. Database uniqueness remains enabled in fixtures. Output has exact keys,
safe nonnegative integers and conservation checks; unexpected/private fields fail.

Source availability is not amount completeness or approval. Do not project amounts,
guess missing zeroes, approve formulas, freeze payroll or replay historical imports.
Require contract tests plus actual migrated-schema PostgreSQL cases covering
cross-book people, review flags, latest revisions, deleted/foreign/wrong-month rows
and database uniqueness. Candidate production observation binds code and runtime
identities separately and is not a deployment.
