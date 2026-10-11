# HR payroll readiness diagnosis

After the reviewed release is running, obtain count-only evidence with the existing runtime diagnostic workflow:

```sh
gh workflow run deploy-production.yml --ref <reviewed-branch-or-main> \
  -f deploy_mode=diagnose-production-runtime-revision -F diagnose_payroll_readiness=true
```

The optional probe is a fixed-scope (`10000001` / `20000001`), time-bounded
`REPEATABLE READ READ ONLY` transaction. It retains the
`hr-payroll-readiness-observation` artifact and prints only ordered payroll
months, bounded count aggregates, and aggregate statuses. It never exposes
employee identities, accounts, amounts, payroll formula text, tax data,
credentials, paths, or database error detail.

`latestObservedMonth` is derived from active-book, nondeleted published
snapshots, receipt-qualified current-database staged snapshots, and
receipt-qualified frozen reconciliation sources. It reports active-book, published-batch, staged-batch,
receipt-qualified-staged-batch, mapped/unmapped snapshot and frozen-source
counts separately; reconciliation runs are counted only when their scoped
receipt-qualified source, legacy batch and attendance month all match. This
prevents run fanout from being presented as source evidence. Attendance and
insurance report their own latest months; formal payroll and reconciliation
report the state counts for the observed payroll month. Insurance counts only the current revision head for each scoped
employee/month, so a closed superseded revision is not readiness evidence.
Formal and reconciliation counters retain every supported workflow state rather
than treating a non-confirmed or rejected row as absent. The probe has a maximum of 24 month values and explicitly reports
the complete distinct-month total plus whether that list was truncated.
An empty list and zero counts are valid evidence only when the query succeeds;
an observer, SQL, schema, permission, or malformed-payload failure terminates
with a fixed error code and produces no substitute zeros.

`latestCompleteMonth`, `eligibility`, and the resulting artifact remain
`UNVERIFIED`. Counts do not prove employee-level coverage, formula correctness,
amount equivalence, tax/attendance/insurance acceptance, or authorization to
calculate, confirm, issue, or pay payroll. This diagnostic does not deploy,
migrate, seed, import HR data, create a source, freeze input, calculate a run,
or change permissions. It is production-import `HOLD` evidence only.

Validation: `node --test scripts/e2e/hr-payroll-readiness.contract.mjs`.

For an explicitly selected month's complete imported-source census, also pass
`-f payroll_coverage_month=2026-07-01`. This optional input accepts only a first
day in `YYYY-MM-01` format (1900–2199), requires the payroll-readiness switch,
and retains a separate `hr-payroll-source-coverage-observation` artifact.
Supply the independently verified `expected_api_commit` and
`expected_web_commit` when observation code and running application differ.

The census includes every scoped snapshot for that month, including failed,
unpublished and receipt-unqualified batches. It reports all scoped book numbers,
including zero-record books, and partitions snapshots into eligible source,
unqualified batch and unavailable reference counts. Mapping states are a
separate complete partition. `sourceRowCount` sums source multiplicity, whereas
`snapshotCount` counts imported normalized rows. `employeeCount` is distinct
across all books: summing per-book employee counts can count a person twice.
`duplicateEmployeeExtraCount` flags multiple mapped snapshots for the same
employee/book/month; it neither chooses a survivor nor removes a record.
Items are aggregated independently to prevent snapshot fanout, and unresolved
item references remain visible. No employee or book names, UUIDs, salary
amounts, source payloads or batch credentials are returned.

Count conservation establishes census coverage only. It does not prove source
approval, input completeness, amount equality or business acceptance. Former
employees are retained; a missing/deleted mapped employee is reported separately.
The existing latest-month readiness query is unchanged. Omitting the new month
does not execute the census. Deployment classification remains unchanged: a
script/workflow change currently requires full release validation; the actual
diagnostic invocation never deploys or writes business data.

Validation also includes
`node --test scripts/e2e/hr-payroll-source-coverage.contract.mjs` and the
opt-in `scripts/e2e/hr-payroll-readiness.pg.mjs` against a fully migrated,
explicitly named disposable review database. Never run its synthetic fixtures
against production or a shared business database.

The same monthly artifact includes `insuranceCoverage` for the distinct employees
in eligible, mapped payroll snapshots whose scoped employee record is available.
This narrower denominator is explicit as `cohortEmployeeCount`; the original
all-source `totals` and per-book census remain unchanged. Cross-book snapshots
are retained, while a person's insurance options are counted once.

`historicalOnlyCount`, `modernOnlyCount`, `bothCount` and `neitherCount` partition
that cohort. Historical availability requires one non-deleted same-month period
with `needs_review=false`. Modern availability requires one latest same-month
revision with its scoped preview. Additional counters expose missing periods,
review flags and ambiguous sources without selecting a survivor. Current schema
uniqueness rejects multiple active historical periods and duplicate revision
numbers; defensive ambiguity counters do not authorize bypassing those constraints.

These counts establish source option availability only. Version/hash must still
match when a source is selected. `insuranceAmountCompleteness` remains
`UNVERIFIED`: only business-approved formula dependencies determine which kinds
and amount components are required. No missing amount is interpreted as zero.
The query returns no personal rows or amounts and makes no business writes.
