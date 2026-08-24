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

## Scenario: HR sensitive read projection and required audit

### 1. Scope / Trigger

- Trigger: reading employee sensitive profiles, payroll runs or payslips, or listing/detail/downloading `hr_employee_document` files.

### 2. Signatures

- Projection: `projectHrEmployeeProfile(profile, canReadFull)` and the explicit HR read projection helpers.
- Audit: `recordHrSensitiveRead(auditService, input)` delegates to `AuditService.recordOperationRequired(input)`.
- Audit body allowlist: `fieldGroups`, `projection`, and `itemCount` only.

### 3. Contracts

- Read scope is resolved by the backend as `park | managed_org_tree | self | none`; no unrelated permission may fall back to `self`.
- Client filters may narrow the resolved scope but never expand it.
- Sensitive reads return explicit allowlist projections rather than TypeORM entities. HR file metadata never exposes storage path, stored name, digest, tenant/park, actor, soft-delete, or version fields.
- Required audit records actor, tenant/park, action, field groups, business identity, route template, projection level, and item count without sensitive values.
- Audit persistence completes before the sensitive response, response headers, or download stream. Audit failure blocks the response.
- The existing best-effort audit entry remains available for non-sensitive historical callers; do not globally change ordinary GET behavior.

### 4. Validation & Error Matrix

- no HR employee-read permission -> `none`; list is empty and detail is safe not-found.
- cross-tenant, cross-park, or outside managed organization tree -> safe not-found/forbidden without target disclosure.
- profile read without full-field permission -> masked contact/identity projection and no internal remark.
- required audit persistence failure -> fail the request before returning metadata or content.
- HR file business authorization failure -> no success audit, metadata, response header, or stream.

### 5. Good / Base / Bad Cases

- Good: a manager sees only employees in their managed organization tree; a sensitive profile response is masked and strictly audited before delivery.
- Base: an HR administrator with the precise profile permission receives the approved projection while identity remains stored/provided only in its protected form.
- Bad: default an unrelated permission to self access, spread an entity into a response, swallow the audit error, or create a download stream before the audit succeeds.

### 6. Tests Required

- Unit-test `park`, `managed_org_tree`, `self`, and `none`, including direct Service invocation without Controller guards.
- PostgreSQL-test recursive organization scope with sibling, foreign-tenant, and foreign-park rows.
- Assert exact response keys for profile, payroll, payslip, approval, feedback, and HR file metadata projections.
- Assert required-audit failure blocks profile/payroll/file responses while legacy best-effort audit behavior remains unchanged.
- Assert HR downloads authorize and audit before headers and stream creation.

### 7. Wrong vs Correct

#### Wrong

```ts
await auditService.recordOperation(input); // errors are swallowed
return fileEntity; // leaks storage and audit internals
```

#### Correct

```ts
await auditService.recordOperationRequired(buildHrSensitiveReadAuditInput(input));
return projectHrEmployeeDocument(fileEntity);
```

## Scenario: Payroll concurrency and accounting integrity

### 1. Scope / Trigger

- Trigger: creating a payroll run, adjusting a payslip, or moving a run from `calculated` to `reviewing` to `confirmed`.

### 2. Signatures

- API: `POST /hr/payroll/runs`, `POST /hr/payroll/runs/:id/review`, `POST /hr/payroll/runs/:id/confirm`, and `PUT /hr/payroll/runs/:runId/payslips/:payslipId`.
- Database: `uq_hr_payroll_base_run`, `ck_hr_payroll_totals_balance`, and `ck_hr_payslip_amounts_balance`.

### 3. Contracts

- Lock the payroll period while creating a run, and lock the payroll run while adjusting or changing state.
- Read the current state, validate the action, update affected payslips, and save the run through repositories obtained from the same transaction manager.
- One active base run is allowed per tenant, park, and period. Correction runs must reference a confirmed run.
- Run totals satisfy `gross_total = deduction_total + net_total`; payslips satisfy `gross_amount = deduction_amount + personal_tax + net_amount`.
- Retryable payroll writes use `IdempotencyInterceptor`; payroll audit metadata always sets `captureBody:false`.

### 4. Validation & Error Matrix

- Concurrent or stale review/confirm state -> `ConflictException`.
- Second active base run for the same scope and period -> database unique conflict translated to `ConflictException`.
- Adjustment against a confirmed run -> reject and require a correction run.
- Unbalanced run or payslip amounts -> database check-constraint failure and transaction rollback.

### 5. Good / Base / Bad Cases

- Good: confirmation locks the run, confirms all payslips, and saves the confirmed run in one transaction.
- Base: replaying the same idempotency key returns the stored response without applying a second mutation.
- Bad: update payslips outside the run transaction, rely only on an application pre-check for uniqueness, or capture salary values in an audit body.

### 6. Tests Required

- Contract-test transaction-scoped repositories, pessimistic run locks, idempotency interceptors, and body-free payroll audit metadata.
- Apply all migrations to an isolated fresh PostgreSQL database and assert the unique index, balance constraints, and successful migration-history row.
- Add database-backed races for duplicate run creation and concurrent state transitions before production release.

### 7. Wrong vs Correct

#### Wrong

```ts
const run = await payrollRunRepo.findOneByOrFail({ id });
await payslipRepo.update({ runId: id }, { status: "confirmed" });
return payrollRunRepo.save({ ...run, status: "confirmed" });
```

#### Correct

```ts
return dataSource.transaction(async (manager) => {
  const run = await manager.getRepository(HrPayrollRunEntity).findOne({
    where: { id, tenantId, parkId, isDeleted: false },
    lock: { mode: "pessimistic_write" },
  });
  // validate, update payslips, and save the run with this manager
});
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

## Scenario: Yuzhou historical attendance calendar and insurance migration

### 1. Scope / Trigger

- Trigger: extracting/loading `timekeeptable`, `insure_method`, or `person_insure`, or changing the T3 attendance/insurance compatibility schema.

### 2. Signatures

- Commands: `extract-yuzhou-t3-attendance-insurance.sh`, `load-yuzhou-t3-attendance-insurance.sh`, and `rollback-yuzhou-t3-attendance-insurance.sh` with the migration flag, run ID, pinned staging hashes, and isolated PostgreSQL target.
- Tables: `hr_attendance_import_batch`, `hr_attendance_calendar_source`, `hr_attendance_day`, `hr_attendance_symbol_rule`, `hr_insurance_policy`, `hr_insurance_policy_item`, `hr_employee_insurance_period`, and `hr_employee_insurance_item`.

### 3. Contracts

- A 31-column month calendar produces rows only for real dates. Preserve every nonblank `legacy_symbol`; only a versioned rule may populate `normalized_kind`, and an unknown symbol remains `needs_review`.
- Employee insurance is an immutable monthly source snapshot. Convert the six wide insurance kinds into vertical items without recalculating old results from current policy.
- Extract money as decimal strings and aggregate in PostgreSQL numeric. A legacy negative contribution base is a sentinel: store a null base plus `legacy_base_negative=true`; do not treat it as a negative contribution.
- Missing/invalid year-month and absent T0 employee mappings are mutually exclusive redacted quarantine outcomes. Loaded plus quarantined must equal 35,008.
- `insureaccount` never enters ordinary staging, evidence, errors, or reports.
- Every parent target has an active record map. Rollback deletes children before mapped parents and requires full, non-partial indexes whose leading column is each child foreign key; a soft-delete partial index cannot accelerate PostgreSQL foreign-key delete checks.

### 4. Validation & Error Matrix

- writable source, `sa`, wrong Compose project, non-isolated target, hash/count drift, or duplicate run ID -> fail before commit.
- missing/invalid period -> `INSURANCE_PERIOD_INVALID`; valid period with missing employee -> `INSURANCE_EMPLOYEE_NOT_MAPPED`.
- unknown attendance symbol -> load original value with `needs_review`, not a guessed work status.
- any per-kind total/employer/employee/supplement sum mismatch or employee summary drift -> roll back the load transaction.
- child foreign-key index is partial or does not lead with the FK -> fail the large rollback performance review even if functional tests pass.

### 5. Good / Base / Bad Cases

- Good: 144 calendars become 4,383 dates; 34,787 insurance periods plus 221 quarantines account for all source snapshots; all six exact monetary checks pass.
- Base: an `N1` symbol remains visible and reviewable without being classified as attendance.
- Bad: invent a month for a null period, recompute old insurance from a policy row, extract the insurance account, or rely on `(tenant_id,park_id,period_id) WHERE is_deleted=false` for FK rollback performance.

### 6. Tests Required

- Run two real extracts and assert the three normalized hashes are identical.
- Contract-test read-only extraction, sensitive-column exclusion, decimal-string preservation, unknown-symbol review, isolated-target/hash guards, redacted error codes, child-to-parent rollback order, and full FK indexes.
- In isolated PostgreSQL run migrations -> load -> nine checks -> duplicate-run rejection -> rollback to zero business rows -> reload.
- Run the API unit suite, full workspace lint, type-check, and production build.

### 7. Wrong vs Correct

#### Wrong

```sql
CREATE INDEX ON hr_employee_insurance_item(period_id) WHERE is_deleted=false;
-- The FK trigger does not have an is_deleted predicate and may scan the full child table.
```

#### Correct

```sql
CREATE INDEX ON hr_employee_insurance_item(period_id);
-- Keep a separate partial business index only when query access also benefits from it.
```
