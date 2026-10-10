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
