# Insurance reference preview API

Scope: `POST /hr/insurance/reference-preview`. This endpoint calculates from one selected imported policy and explicit bases. It creates no insurance period, payroll run, policy activation or durable confirmation evidence.

- Require all three existing permissions: park insurance read, insurance amount read, park employee read. Team/self-only authority cannot see employer rates or amounts. Repeat authority checks in the service before querying.
- Resolve employee and policy by ID, tenant, park and non-deleted status. Return the same safe not-found code for missing/foreign employee and policy.
- Require expected policy version, explicit variant 1/2, year/month, six distinct per-kind bases and boolean fund inclusion. DTOs do not coerce strings into booleans or numbers. Never accept policy rates or fixed addends from the client.
- Select only allowed policy columns and exact variant factor rows. Imported source snapshots, account numbers, internal actor/remarks and private source IDs never enter response or audit. Use the precise calculation module.
- Use a transaction and SHARE locks for the referenced rows, then bind policy/employee versions, selected factor values and versions, period, canonical bases, fund choice and engine version into a SHA256 input hash. This hash describes this reference result; it is not persistent freezing or proof of business approval.
- Return `mode=reference_only`, `confirmationEligible=false`, source policy status and selected variant. Do not silently interpret historical status as a current approved policy or infer its effective period from source description.
- Required audit must succeed before financial response. Audit only hash, mode, field groups and count; record POST correctly without personal/base/amount values.
- A pure calculation POST has no business-write replay claim. The global idempotency header guard still applies; no generic response-cache interceptor or published financial record is added.
- Before durable confirmation, implement independent immutable policy versions/effective periods, owned previews, current personnel/basis checks, a transactionally revalidated hash and parent locks that also block child insert phantoms, correction/close semantics and payroll references.

Checks: scoped source access and versions, exact numeric rounding, input hash changes, source row conservation, DTO negative cases, required audit failure, permission metadata/direct service authority. Isolated full-schema PostgreSQL tests are opt-in; no real JWT/role/browser or current-business acceptance is implied by synthetic tests.
