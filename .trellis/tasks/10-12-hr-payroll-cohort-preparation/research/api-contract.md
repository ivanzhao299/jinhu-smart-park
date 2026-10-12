# Preparation cohort API contract

GET `/hr/payroll/reconciliations/preparation-cohort` with required UUID `legacyBatchId`, strict `periodMonth=YYYY-MM-01`, `page` default 1 (max 5000), `page_size` default 50 (max 100).

All seven permissions before any probe: HR_PAYROLL_RECONCILIATION_REVIEW, HR_EMPLOYEE_READ, HR_ATTENDANCE_READ, HR_ATTENDANCE_PAYROLL_INPUT_READ, HR_INSURANCE_READ, HR_INSURANCE_AMOUNT_READ, HR_PAYROLL_RULE_READ. Existing employee/attendance/insurance READ privileges grant park scope; team/self grants are insufficient. Scope bound to actor tenant/park (super/wildcard does not accept a foreign scope argument).

```ts
type Counts = {
  recordCount: number; sourceRowCount: number; itemCount: number;
  mappedRecordCount: number; unmappedRecordCount: number;
  duplicateSourceCount: number; quarantinedCount: number;
  unavailableReferenceCount: number; unavailableEmployeeCount: number;
  unresolvedItemCount: number; duplicateEmployeeExtraCount: number;
};
type PreparationCohort = {
  legacyBatchId: string; periodMonth: string; sourceStatus: 'staged'|'published';
  preparationOnly: true;
  totals: Counts & { employeeCount: number; bookCount: number };
  books: Array<Counts & {
    bookId: string; bookName: string; legacyScheme: number; available: boolean;
    approvedFormulaCandidateCount: number;
    currentNetPolicy: null | { id: string; versionNo: number; status: string; netItemVersionId: string };
  }>;
  items: Array<{
    employeeId: string; employeeCode: string; fullName: string;
    recordCount: number;
    books: Array<{bookId: string; recordCount: number}>;
    attendanceInputCount: number;
    historicalInsurancePeriodCount: number;
    historicalInsuranceNeedsReview: boolean;
    historicalInsuranceSourceCount: number; // 1 iff exactly one active period and no review flag, else 0
    modernInsuranceSourceCount: number; // latest same-month revision with scoped preview; >1 explicit ambiguity
  }>;
  total: number; page: number; page_size: number;
};
```

Counts are exact for selected batch/month across all books, including soft-deleted reference/snapshot records. Mapping categories partition recordCount; unavailable counters overlap intentionally. All items count scoped nondeleted item rows, independently aggregated. Mapped employees need live scoped employee plus available snapshot/book/period; only this employee list deduplicates cross-book people. Missing/unavailable employees remain in totals; duplicateEmployeeExtraCount means extra mapped records within the same book/person.

Staged requires unpublished batch, successful T4 receipt targetScope and sourceSnapshotHash match, succeeded migration control linked to receipt and current_database. Published source accepted. Missing/foreign/unqualified batch -> 409; scope mismatch -> 403; no source records for month -> 409. No calendar inference or fallback.

Attendance count requires actual nondeleted input item membership in an effective batch with nondeleted closed same-month period. Insurance semantics match diagnostic: historical exactly one nondeleted same-month period and no needs_review; modern highest revision_no same employee/month + matching scoped preview, modern close not required. No amount, raw JSON, contact, banking or identification fields. No source selection, rule approval, freeze, calculation or business writes.

One repeatable-read transaction, statement timeout 15s, lock timeout 2s, 5000 source records/200000 active items bounds, stable employeeCode/employeeId order, same-manager mandatory metadata audit. Beyond-end pages retain totals. Per-page live snapshot consistency does not promise a frozen export across separate requests; export label must say current preparation list, not frozen payroll.
