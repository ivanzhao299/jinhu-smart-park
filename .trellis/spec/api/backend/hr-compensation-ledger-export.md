# Formal compensation ledger snapshot export

## 1. Scope / Trigger
HR needs the complete currently filtered formal salary-setting ledger for reconciliation. This is salary configuration, not wages paid or legacy report-layout parity.

## 2. Signatures
GET /hr/compensation/assignments/export; HrCompensationAssignmentExportDto accepts optional trimmed keyword max100 and optional UUID employeeId. Response {items:HrCompensationAssignment[],total:number,snapshotAt:string}. Timestamp is canonical UTC ISO milliseconds.

## 3. Contracts
Controller/service require HR_COMPENSATION_READ and exact actor tenant/park. List/export share filter, select and row projection helpers; same-scope nondeleted assignment/employee/plan joins, literal escaped ILIKE across employee/plan codes/names; departed retained. Stable effective_from DESC,id DESC. Read snapshot timestamp then <=5001 rows in one REPEATABLE READ transaction. Return all <=5000, never truncate. Exact decimal/date text and existing minimal ledger projection only. Required sensitive-read audit uses financial+compensation, park projection, export path and actual itemCount before return. No writes, new permissions or migrations.

## 4. Validation / Error Matrix
Missing READ/foreign actor -> Forbidden before transaction. Invalid DTO -> global validation rejection. Empty -> audited total0/items[]. 5001 -> explicit BadRequest, no partial payload. Required audit failure -> read rejects. Existing paged ledger retains page/count and query semantics.

## 5. Good / Base / Bad Cases
Good: 5000 matched rows returned with exact amounts. Base: departed employee's retained salary-setting records included. Bad: silently slice first5000 or use independent browser pages as a snapshot; joining a foreign/deleted employee/plan.

## 6. Tests Required
Real disposable PostgreSQL actual service/list: >page completion, stable tie order, literal percent/underscore/backslash with optional employee filter, departed and deleted/foreign refs, exact numeric/calendar/ISO values, empty, pre-query permission/scope, audit metadata and failure, exact5000 and5001. Use independent connection committing update+insert after actual timestamp query; current export sees original snapshot, next sees update. Assert labelled container removal. Focused contracts plus API lint/typecheck/build; browser/CSV covered Web spec.

## 7. Wrong vs Correct
Wrong: SELECT ... LIMIT5000 then label partial rows complete. Correct: LIMIT5001 and reject overflow. Wrong: use ordinary isolation for timestamp and later salary read. Correct: same REPEATABLE READ transaction, verified against a genuine second connection.
