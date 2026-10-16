# Modern payroll preparation observation

The optional `diagnose_payroll_readiness` production runtime observer now returns
`modernPreparation` separately from legacy `approvedFormulaCount` and
`currentNetPolicyCount`. Legacy formula approval is not an additional prerequisite
for the modern whole-month trial. No workflow, permission or database schema is changed.

The eight modern counters describe the latest observed month of active,
receipt-eligible source books: source books, linked modern rule books, books with
an approved effective rule, ordinary open-period draft and confirmed inputs,
latest confirmed inputs referencing the current effective rule, corresponding
books, and books whose latest input roster exactly matches their source roster.
The latest effective version is selected by `effective_from <= month`; future,
draft and foreign-scope versions cannot contribute. A later confirmed revision,
including a correction revision, prevents fallback to an older ordinary input,
as in the existing formal input consumer. Correction inputs do not themselves
count as ordinary month inputs. Closed/deleted periods are excluded.

Exact roster matching compares full employee IDs, cardinality and mapping status.
Two books can contain the same employee. Duplicate records within one book,
missing employees and duplicate input IDs do not establish exact coverage.
This observer does not select a legacy batch for the user, validate each employee
version or formula dependency, verify money, freeze a source, calculate, approve
or pay. Multiple eligible source batches contributing the same employee to one
book can therefore conservatively prevent exact-roster evidence. Use the actual
trial options and source selection for the final calculation contract.

`modernCalculationReadiness` and overall eligibility remain `UNVERIFIED`, even if
every counter looks complete. Only counts and fixed scope labels leave production;
no employee IDs, names, rules, input bodies or amounts are emitted. The observer
uses a repeatable-read read-only transaction, statement/lock limits and ROLLBACK.
Unexpected or inconsistent output is rejected rather than converted to zero.

Focused checks:

```sh
node --test scripts/e2e/hr-payroll-readiness.contract.mjs
HR_PAYROLL_MODERN_READINESS_PG=1 node --test scripts/e2e/hr-payroll-modern-readiness.pg.mjs
```

The required PostgreSQL check creates an owned `postgres:16-alpine` container
with a tmpfs data directory and no host port exposure. Cleanup removes only that ownership-labelled container and its anonymous volumes, then verifies its absence.
It exercises the actual exported modern SQL fragment using minimal query-column
fixtures, including foreign scopes, future/draft/stale rules, latest revisions,
corrections, cross-book people, duplicates, closed periods and row immutability.
It also executes the entire generated observer SQL against empty query-column projection tables, checking integration syntax and the sanitized zero-source response. This is query-semantic evidence, not a full migration/bootstrap or business-guard
test. With the flag enabled, startup/query failures fail the check; there is no
fallback to a shared database. Existing `hr-payroll-readiness.pg.mjs` remains the
separate migrated-schema/source-receipt check. Actual production values require
dispatching the existing read-only observer after the reviewed script reaches main.
