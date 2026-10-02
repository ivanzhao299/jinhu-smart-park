# Reviewed unpublished payroll comparison sources

- Freeze only one explicitly chosen legacy batch, book and month; require successful T4 operation/control receipts in the same scope and current database, exact ownership, counts and content hash.
- `staged` is appendable. Never accept it directly for simulation or publish it to make a test pass. Use `hr_payroll_reconciliation_source` and preserve original batch visibility.
- The source function uses READ COMMITTED plus table SHARE locks and receipt row locks. Set bounded statement/lock timeouts in the caller before invoking it; snapshot/item count limits apply before JSON aggregation.
- Creation requires `HR_PAYROLL_RECONCILIATION_REVIEW`, an explicit review reason, HTTP idempotency and body-free audit. Persist required metadata audit with the same transaction manager; never log private input or monetary rows.
- Freeze evidence is append-only, payload/hash/count/scope constrained, and exact-source retries reuse the source UUID. PUBLIC has no table/function access.
- Simulations still require calculate permission, closed effective attendance and approved formulas/net mappings/compensation/insurance. Explicit frozen sources must match scope, legacy batch and month; recheck succeeded receipts and reject mismatches without fallback.
- Read frozen JSONB as SQL text, then project `numeric(20,4)` in PostgreSQL. Never parse salary JSON numeric values into JavaScript `number`.
- Bind the source UUID by composite FK to the run's scope and legacy batch; include its hash in frozen calculation evidence. Preserve historical published-path behavior.
- No source creation or simulation may change legacy publication, create formal payroll/payslips or enable payments. A code test does not accept an actual business period or legacy amount equivalence.
- Verify DTO bounds, role denial, exact decimal evaluation, audit failure, source mismatch and unchanged published-path contracts. Real PostgreSQL must cover append/rollback races, immutability, source/run binding and cleanup. Fresh/upgrade migration evidence and actual business acceptance remain distinct.

References: `000319_hr_payroll_reconciliation_source.sql`, `000320_hr_payroll_reconciliation_source_binding.sql`, `hr-payroll-history.service.ts`, `scripts/verify-hr-reconciliation-source-pg.mjs`.
