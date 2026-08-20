# HR Management Domain Contract

## Scenario: Employee-to-payroll auditable HR lifecycle

### 1. Scope / Trigger

- Trigger: changes under `apps/api/src/modules/hr`, HR migrations/seeds, `/hr/*` pages, or `hr_employee_document` file access.
- HR is an independent `hr` module. `sys_user` is login identity; `hr_employee` is the employment aggregate and may exist without a user link.

### 2. Signatures

- Employee lifecycle: `POST /hr/employees/:id/transitions` with `action`, `effectiveDate`, `reason`, and transfer references when applicable.
- Goal cascade: `hr_goal.parent_goal_id`; levels must progress `group -> department -> employee`.
- Work reports: `POST /hr/work-reports/me`; direct/organization-tree review uses `POST /hr/work-reports/:id/review`.
- Performance: `self-review -> manager-review -> calibrate`; plan creation snapshots overlapping employee goals into `hr_performance_item`.
- Feedback: assignment relations are `self|manager|peer|subordinate`; anonymous results use a configured minimum response count.
- Payroll: `draft -> calculated -> reviewing -> confirmed`; corrections reference a confirmed `correction_of_run_id`.
- HR approval: `draft -> submitted -> approved|returned|withdrawn`, with returned requests eligible for resubmission.

### 3. Contracts

- All HR rows and references are tenant + park scoped in service validation.
- Employee status is changed only by lifecycle actions; generic profile update cannot change it.
- Child-goal weights under one parent cannot exceed `1.0`; employee check-ins can update only the actor's own goal.
- Performance plans freeze target name, metric, value, unit, due date, and weight.
- Anonymous 360 results never expose reviewer identity and remain unavailable below the threshold.
- Confirmed payroll and payslips are immutable. Corrections create a new run; they do not overwrite the confirmed snapshot.
- `hr_employee_document` is a protected file type. Generic file permissions do not replace HR profile permission and employee scope checks.
- Salary, sensitive profile, approvals, and 360 bodies use audit metadata without captured request bodies.

### 4. Validation & Error Matrix

- Cross-scope user/org/position/employee/file reference -> reject without exposing the foreign record.
- Invalid lifecycle action for current status -> `BadRequestException`.
- Sibling goal weight above 100% -> `BadRequestException`.
- Employee check-in against another employee's goal -> not found/denied.
- Self/manager/calibration action outside its stage -> `BadRequestException`.
- Anonymous response count below threshold -> `ForbiddenException`.
- Duplicate base payroll run -> `ConflictException`.
- Adjustment after payroll confirmation -> require correction run.
- Team report/performance outside managed organization tree -> `ForbiddenException`.

### 5. Good / Base / Bad Cases

- Good: group goal cascades to a department and employee; daily work links to the employee goal; the goal becomes a frozen performance item; confirmed variable compensation is included in a new payroll snapshot.
- Base: a preboarding employee exists without a login account and later links to a current-scope user.
- Bad: directly update `employmentStatus`, show raw 360 reviewers, grant department managers payroll access, or edit a confirmed payslip in place.

### 6. Tests Required

- Shared build plus API/Web type-check and lint.
- `hr-foundation.contract.spec.ts` must cover lifecycle, scope, protected files, goal weights, performance state, anonymity, payroll freeze/correction, and approval actions.
- `hr-management-foundation-contract.mjs` must cover the module, page routes, least-privilege roles, and absence of automatic user-role bindings.
- File business access tests must keep protected generic-list/read/download/delete behavior intact.
- Production Web and API builds plus desktop and 390px browser checks for modified HR pages.
- Fresh-schema migration + production seed rehearsal in an isolated PostgreSQL database.

### 7. Wrong vs Correct

#### Wrong

```ts
employee.employmentStatus = "departed";
confirmedPayslip.netAmount = correctedNet;
return feedbackResponsesWithReviewerIds;
```

#### Correct

```ts
await transitionEmployment(scope, actor, employeeId, departureAction);
await createPayrollRun(scope, actor, { periodId, correctionOfRunId: confirmedRunId });
return { responseCount, averageScore };
```

## Scenario: HR work reports in the unified Workflow Inbox

### 1. Scope / Trigger

- Trigger: submitting, confirming, or returning an HR daily, weekly, or monthly work report.
- HR actions must reuse `biz_user_message`; do not create an HR-only notification table or inbox.

### 2. Signatures

- Submission projection: `HrNotificationService.publishWorkReportSubmitted(scope, actor, report, manager)`.
- Review projection: `HrNotificationService.publishWorkReportReviewed(scope, actor, report, manager)`.
- Inbox fields: `category=hr`, `source_type=hr_work_report`, `biz_type=hr_work_report`, and `target_url=/hr/work-reports`.

### 3. Contracts

- Write the message with the same `EntityManager` transaction as the report state transition.
- A submitted report targets the linked system user of `reviewer_employee_id`.
- A confirmed or returned report targets the linked system user of `employee_id`.
- A returned report uses `priority=high` and `action=supplement`; a confirmed report uses `action=confirmed`.
- `unique_key` includes report ID, resulting status, and recipient user ID; inserts use `orIgnore()` for retry safety.
- Employees without a linked system account remain valid HR records; message publication becomes a no-op for them.

### 4. Validation & Error Matrix

- Reviewer employee absent or without `user_id` -> keep the report transition and create no message.
- Employee recipient absent or without `user_id` -> keep the review result and create no message.
- Actor equals recipient -> create no redundant self-notification.
- Replayed message unique key -> ignore the duplicate, do not fail the HR transaction.
- Message insert failure other than uniqueness conflict -> roll back the report transaction.

### 5. Good / Base / Bad Cases

- Good: an employee submits a weekly report, the manager sees an HR review item, returns it, and the employee sees a high-priority supplement item.
- Base: a preboarding employee without a login account has no inbox delivery.
- Bad: save the report, commit, and publish a best-effort message afterward; this can leave state and inbox inconsistent.

### 6. Tests Required

- Unit-test submitted, returned, confirmed, missing-account, and self-recipient projections.
- Contract-test `UserMessageEntity` module wiring, HR category, target URL, and deduplicating insert.
- Workflow Inbox acceptance must verify the generated item opens `/hr/work-reports`.

### 7. Wrong vs Correct

#### Wrong

```ts
const report = await reports.save(nextReport);
await messages.save({ recipientId: report.reviewerEmployeeId });
```

#### Correct

```ts
return dataSource.transaction(async (manager) => {
  const report = await manager.getRepository(HrWorkReportEntity).save(nextReport);
await notifications.publishWorkReportSubmitted(scope, actor, report, manager);
  return report;
});
```

## Scenario: Yuzhou historical employment event migration

### 1. Scope / Trigger

- Trigger: extracting or loading `dbo.readjust/readjustitem`, or changing legacy compatibility columns on `hr_employment_event`.

### 2. Signatures

- Extract: `ALLOW_YUZHOU_MIGRATION=yes YUZHOU_MIGRATION_RUN_ID=<run> ./scripts/extract-yuzhou-t1-employment-events.sh`.
- Load/rollback additionally require `YUZHOU_TARGET_DATABASE=jinhu_hr_migration_lab_<suffix>` and an explicit staging directory when extract and load run IDs differ.
- Database compatibility fields: `legacy_event_no`, `legacy_event_type`, `legacy_state`, `source_effective_at`, `migration_decision`, `is_historical_import`.

### 3. Contracts

- The SQL Server source is read-only and extraction uses the dedicated ETL login, explicit columns, stable `ORDER BY id`, and pinned file checksums.
- Historical import writes `hr_employment_event` directly; it never calls the online lifecycle transition, changes the current employee aggregate, runs current approvals, or publishes inbox messages.
- Employee resolution uses the T0 employee mapping/current scoped employee code. Missing target employees are quarantined with only irreversible source identity evidence.
- Historical event numbers are unique per tenant and park. Unknown event types or nonstandard legacy state are loaded only as `needs_review`, never silently treated as approved.
- Event snapshots exclude salary fields and actor/approver names. PostgreSQL COPY JSONL doubles backslashes so escaped source control characters remain valid JSON rather than becoming raw control bytes.
- Rollback deletes only target IDs proven by active `legacy_record_map` rows for the selected batch.

### 4. Validation & Error Matrix

- source database writable, login `sa`, invalid run ID, unpinned staging hash, wrong container/project, or non-isolated target -> fail before target mutation.
- source count other than 6,887 or duplicate/blank source identity -> fail extraction/load.
- missing T0 employee target -> quarantine; loaded plus quarantined must equal source count.
- employee aggregate checksum changes during load -> fail the transaction.
- duplicate run ID or duplicate historical event number -> reject without count change.

### 5. Good / Base / Bad Cases

- Good: 6,851 mapped events load, 36 events for quarantined T0 employees remain redacted errors, and employee current-state checksum is unchanged.
- Base: one legacy state outside the accepted state remains a visible `needs_review` historical event.
- Bad: replay old events through `transitionEmployment`, expose old salary/approver values in staging reports, or delete events by remark without record-map proof.

### 6. Tests Required

- Contract-test read-only/source ordering, forbidden sensitive columns, isolated target guards, checksum pinning, employee-state check, record-map rollback, and no employee deletion.
- Run two real extracts and assert equal event/type hashes.
- In isolated PostgreSQL run migration → load → checks → rollback → reload; assert duplicate-run rejection and unchanged row count.
- Run HR/API unit tests, lint, type-check, build, and scan migration errors for raw sensitive keys.

### 7. Wrong vs Correct

#### Wrong

```ts
await transitionEmployment(scope, actor, employeeId, historicalDto);
```

#### Correct

```sql
INSERT INTO hr_employment_event (..., is_historical_import, migration_decision)
SELECT ..., true, 'accepted'
FROM staging
JOIN hr_employee ON exact_scoped_t0_identity;
```

## Scenario: Yuzhou historical labor contract migration

### 1. Scope / Trigger
- Trigger: `compact`, `compact_c`, or `compacttypecode` extraction, contract schema changes, or historical contract loading.

### 2. Signatures
- Commands: `extract-yuzhou-t2-contracts.sh`, `load-yuzhou-t2-contracts.sh`, and `rollback-yuzhou-t2-contracts.sh` with migration flag, run ID, pinned staging hashes, and isolated target database.
- Tables: `hr_contract_type`, `hr_contract`, `hr_contract_change`.

### 3. Contracts
- Main contracts and renewal/change history are separate immutable historical aggregates; a change never overwrites the main source snapshot.
- Employee and master-contract resolution are exact and scoped. Missing T0 employees or masters are quarantined, not synthesized.
- Raw contract text and file paths never enter reports or downloadable file references; only presence metadata is migrated until the protected-file phase.
- Rollback order is change, contract, type and every deletion requires active record-map proof.

### 4. Validation & Error Matrix
- writable source, wrong project/target, count/hash drift, duplicate run -> fail before commit.
- missing employee -> `CONTRACT_EMPLOYEE_NOT_MAPPED`; missing master -> `CONTRACT_CHANGE_MASTER_NOT_FOUND`.
- loaded plus quarantined must equal 802 main and 357 change rows; employee current-state checksum must remain unchanged.

### 5. Good / Base / Bad Cases
- Good: 798 contracts and 348 changes load; 4 and 9 respectively are redacted quarantine records.
- Base: terminated source status remains terminated history even when its dates are old.
- Bad: invent a master for an orphan change or expose `compacttext/compactfile` content.

### 6. Tests Required
- Two deterministic real extracts, isolated migration/load/check/rollback/reload, duplicate-run rejection, error redaction, API unit/lint/type/build.

### 7. Wrong vs Correct
- Wrong: update the main contract end date for each `compact_c` row.
- Correct: append ordered `hr_contract_change` rows linked to the immutable main contract.
