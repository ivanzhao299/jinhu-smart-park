# Design: 000194 runtime-control production convergence

## Failure boundary

Run 31286011713 passed the 000189 predeploy gate and completed 000189. The first failure was
`property-runtime-control-scope-exact-set-drift` in 000194. Its schema-only prerequisite created
`sys_property_runtime_control`, while 000194 expects the Cartesian exact set of every qualifying
active asset scope and 12 signed controls. Fresh migration-before-seed CI has zero qualifying scopes,
so it did not represent production where an assignment already exists.

## Data contract

One shared signed manifest defines 12 control keys and their kind/target/adapter values. A qualifying
scope is derived only from active `rel_tenant_module` rows joined to the enabled `asset` module and
must resolve to one active tenant and one active asset park.

The new prerequisite performs insert-only convergence:

1. derive and validate qualifying scopes;
2. validate every pre-existing signed-key row has the canonical immutable definition and disabled old
   contract state;
3. reject any runtime-control row outside the expected scope/key Cartesian set;
4. insert only absent expected rows with the old hash/reason required by unchanged 000194;
5. assert bidirectional exact-set and exact definitions.

No updates or deletes are allowed. Existing bad evidence remains visible and blocks deployment.

## Diagnostic and deployment boundary

A read-only diagnostic mirrors the same scope and signed-manifest classification. It runs through the
production workflow after required secret setup but before release marker/source sync/build/deploy.
`report` emits non-sensitive evidence; `enforce` returns nonzero for invalid scopes, extra rows, or
definition drift. Missing rows are classified as safely repairable by the new prerequisite, while the
deployment gate must verify the deployed source contains that prerequisite checksum before allowing the
normal migration path.

## Compatibility and rollback

`000194` stays byte-for-byte unchanged and remains retryable because production recorded it only as
failed and its transaction rolled back. The new prerequisite has its own history identity and checksum.
Any prerequisite failure stops before 000194. Source rollback remains application-only and never tries
to reverse database state.

## Prevention

Release Smoke adds a production-shaped pre-seed assignment fixture before 000194, proves the prior
schema-only state fails, then proves prerequisite convergence plus unchanged migration success. The
Trellis operations spec will require every data-bearing immutable migration precondition to have both a
production-shape fixture and a same-query predeploy diagnostic; a single-migration gate is not treated as
a general pending-migration rehearsal.
