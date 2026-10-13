# Whole-month modern payroll trial comparison

## Scope and public boundary

`GET /hr/payroll/trial-comparisons/options`, `GET /source-options` and `POST /hr/payroll/trial-comparisons` are a calculate-only workflow. Require current tenant/park plus MANAGE, DETAIL_READ, EMPLOYEE_READ, RULE_READ and RECONCILIATION_CALCULATE before probes. Insurance reads additionally require INSURANCE_READ and INSURANCE_AMOUNT_READ when the approved rule consumes those codes; supplied insurance choices require this authority before source probes. The POST carries the global idempotency header but intentionally has no replay interceptor storing private result bodies. Every successful read/calculation requires metadata-only same-manager audit. No new DDL, payroll runs, payslips, publication, payment or persisted acceptance/history.

## Source identity and complete scope

The request selects a receipt-qualified staged legacy batch and month, every actual record-bearing book, one exact frozen source per book, confirmed modern input/version, explicit attendance/insurance choices and modern-code to source-item-version mappings. Discover the complete book set from scoped month snapshots, including unavailable/unmapped records. Never derive month coverage from the catalog's book count or a client count. Reject abnormal source multiplicity, unavailable employee/source, duplicate employees within one book, omitted/extra books and mismatched input roster. Cross-book people remain separate source-record calculations; distinct employee count is a separate aggregate.

Options are advisory complete bounded metadata snapshots. They do not automatically choose a source, input, item version, zero amount or latest source mapping. Current effective rule and its book link are rechecked when calculating. Closed-period correction inputs are excluded from this ordinary month comparison.

## Consistency and limits

Existing `hr_build_payroll_reconciliation_source` requires READ COMMITTED. Trial acquires table SHARE locks for snapshots, snapshot items, book periods, record maps, books and item definition/version catalogs before census; batch, succeeded T4 receipt and current-database migration control are held FOR SHARE. Builder validates exact control ownership and current content under the same locks; the resulting SHA must match the explicitly selected immutable frozen source. Modern `lockConfirmedInput` retains period/rule/input/employee locks, then the shared `calculatePrepared` primitive retains referenced compensation/closed attendance/modern insurance source locks. These locks remain through the required audit and transaction completion. Options use REPEATABLE READ independently and are revalidated on POST.

Bounds: 50 books, 5000 source records, 200000 source items/result lines, 16 MiB returned projection, 30-second total calculation deadline, 15-second statements, 2-second lock waits and 30-second idle transaction limit. Formal inputs retain their existing 2000-employee bound. Oversize/drift rejects the entire result, never a partial page. Lock/serialization/deadlock/builder errors become an actionable conflict.

## Exact comparison and evidence

Extract frozen JSON decimals through PostgreSQL numeric(20,4)::text. Never parse JSON numbers through JavaScript Number. Compare monetary rounded formal amounts and informational four-decimal values with signed scaled BigInt differences. Mappings are one-to-one modern code to scoped source version; labels do not establish identity or accounting role. Keep all modern items and every unconsumed source item. Preserve missing, NULL, text/date, unknown, duplicate and unmapped states as not comparable; unmapped items retain their frozen raw_value and legacy_column_name as the exact fallback label, without inferring a numeric value or role; never coerce them to zero. Source net is only the explicit frozen snapshot net_amount, with missing net independently counted.

Return complete records once; UI paging operates on that same result. Export includes source record/item/version IDs, frozen source and binding hash, input/version/hash, rule/hash, calculation and engine identity, selection hash and result hash. Calculation hash binds the actual consumed frozen sources. Result hash binds selection hash, evidence and records; it is integrity evidence for this response, not a durable signed acceptance.

## Formal consumer reuse

`HrPayrollFormalRunService.calculatePrepared` is internal and requires a caller-owned transaction plus confirmed preparation. Both formal creation and trial call this single existing source loader/composer. Formal duplicate employee/correction checks and all writes remain in create, before/after the shared calculation respectively. Trial never calls create then cancels. The existing formal-run source options support an internal enforceSourcePermissions flag for the trial wrapper without changing ordinary formal workflow policy.

## Evidence

Owned localhost PostgreSQL test executes original catalog/freezing/formal migrations unchanged with explicit personnel/receipt/control prerequisite fixtures. It proves synthetic 54+39 records, 64 distinct people, 29 overlapping people and 2295 source items; exact formal equality; source-only/null/nonnumeric preservation; full source hash/roster/version/book rejection; metadata audit rollback; actual Nest HTTP permissions/DTO/global idempotency guard; no business table changes; actual source append waits for trial locks and next trial rejects drift; formal cross-book overlap still rejects posting. This is not a full-schema fresh/upgrade gate, JWT/production role acceptance or real July financial proof.

The 30-second total calculation budget is checked again after the required audit, before the transaction callback returns. Crossing it during audit rejects the entire result and rolls back the audit insert; statement timeouts alone do not enforce the total budget.
