# Source formal activation verification

Use only the owned synthetic fixture. This feature does not authorize a production import or July business trial.

Run from repository root:

```sh
pnpm --filter @jinhu/shared lint
pnpm --filter @jinhu/shared typecheck
pnpm --filter @jinhu/shared build
node scripts/e2e/hr-performance-source-activation.contract.mjs
node scripts/e2e/hr-performance-source-drafts.contract.mjs
node scripts/e2e/hr-performance-detail-appraisal.contract.mjs
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api build
HR_PERFORMANCE_SOURCE_ACTIVATION_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-performance-source-activation.pg.spec.ts
HR_PERFORMANCE_CHANNEL_WORKFLOW_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-performance-channel-workflow.pg.spec.ts
# This standalone entry also requires the owned loopback lab POSTGRES_* connection.
# The activation suite invokes it with that connection and clears NODE_TEST_CONTEXT.
HR_PERFORMANCE_REVIEW_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-performance-review.pg.spec.ts
```

The new fixture creates uniquely labelled PostgreSQL16 tmpfs, runs the actual full `scripts/db-migrate.sh`, calls genuine311→308→310→309 under controlled fixture-only writer roles, and obtains qualification through the restricted pure facade. It does not insert counterfeit receipts or rely on373 query projection as source-proof acceptance. Cleanup verifies exact container name and owned label before removal, including partial setup failure. Logs/manifests remain private0700/0600 under `/Users/mac/.codex/artifacts/hr-performance-source-activation-20261017`; reports contain handles/counts/hashes, never source rows/secrets.

Verify complete101 selected independent details within a102-detail batch,41 full grade descriptions, three masters across two sessions, exact null/zero/18,0/18,2/19,4 strings and source timestamp provenance; rev1 allUNPROVIDED and original receipt-bound rev2. Preview configuration edits require saved CAS and difference acknowledgement. manual_current requires explicit current binding and complete policy but has no source baseline. Template-only creates a draft, allowing normal maintenance.

Exercise true HTTP replay, different-key dedup, changed body conflict, live revoke before cached response, source/head/target races, direct SQL invalid request/mapping/cohort/baseline, fresh-target-only constraints, history privacy and ordinary lifecycle after activation. Confirm no old function/ACL/source fingerprints change. A restricted role may execute the new facade only with its explicit fixture grant and must remain unable to read protected receipts directly; production runtime execution authority is separately verified at release.

The immutable internal request JSONB contains closed request metadata only. It exists for SQL-independent digest/target-CAS checking and must never appear in write receipts, audits or history. Salary values in differences are structurally omitted without the read intersection; safe origin metadata never carries input values.

Local synthetic tests, Web component transport tests/native rendering, CI/runtime exact SHA, real-role acceptance and actual business reconciliation are separate evidence classes. July2026/all imported data/all populated books/WuEnguo/calculate-only remains NOT_EXECUTED unless separately authorized and executed.

Review regressions: an unrelated master with nonnull detail notes must not require a detail-note policy for the selected note-free master. Source cycle code/name must remain equal to the immutable closed request, including direct SQL updates. SQL and shared request validators reject ECMAScript Unicode whitespace-only names/reasons and accept full legal code-point lengths. Web controls allow the UTF-16 envelope needed for those lengths, while shared submission validation rejects excess code points. Configuration differences use Chinese business labels.

The planned shared/API `.spec.ts` filenames are replaced by the executable shared `.contract.mjs` and actual PG/HTTP suite; this is an explicit coverage-path substitution. It does not replace final Web build/native, production runtime privilege/SHA checks, or real-role/business acceptance.
