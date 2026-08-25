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

## Scenario: Versioned performance planning and frozen evidence

### Contracts

- Published template versions freeze dimensions, decimal weights, score ranges and levels; child INSERT, UPDATE and DELETE all fail.
- Publishing a review cycle freezes the exact template version, applicable organizations, employee identity snapshot, goal version snapshot and confirmed attendance/reward/training/360 reference versions.
- Evidence references are read-only facts and never write payroll, attendance, reward, training, feedback or employee aggregates.
- Clients submit dimension scores only. Weighted total and level are derived by the server from the frozen template snapshot.
- Planning reads resolve to `park | managed_org_tree | self | none`; query filters only narrow scope and required audit completes before returning cycle data.

### Tests Required

- Template0 fresh, predecessor upgrade, checksum replay and production seed replay.
- Published child INSERT/UPDATE/DELETE, duplicate-code concurrency, exact decimal recomputation and zero-side-effect PostgreSQL gates.
- Three-role API/Web projection and desktop/390px browser acceptance before release.

## Scenario: Append-only performance evaluation, calibration and appeal

### Contracts

- Self and manager submissions are append-only frozen-dimension evidence; the server recomputes every numeric total and rejects actor drift, self-review and cross-management-tree review.
- Calibration is an active meeting batch with explicit participants. Every adjustment records before/after frozen dimension scores and a non-blank reason; completing the batch derives the final score and level from immutable evidence in the same transaction.
- Before `employee_acknowledged`, a self projection exposes neither manager scores, calibration scores, final result nor result-bearing action history. Required audit must succeed before any review/action projection is returned.
- Acknowledgement and appeal belong only to the evaluated employee. Appeal review has its own atomic permission; upheld decisions provide replacement dimension scores for database recomputation, while rejected decisions preserve the previous result.
- `confirmed` results and all submissions, calibration entries and actions are immutable. State, append-only action and privacy-safe workflow notification commit together, and evaluation never writes employee, attendance, payroll or payslip facts.
- Every POST is protected by one exact permission, `IdempotencyInterceptor`, and body-free audit metadata. Direct service access resolves only to `park | managed_org_tree | self | none` and fails closed.

### Tests Required

- PostgreSQL-test score/level recomputation, invalid transition, missing calibration reason, terminal immutability, duplicate/concurrent actions, appeal upheld/rejected, and zero online-domain side effects.
- Contract-test exact controller atoms, employee result hiding, body-free idempotent writes, least-privilege seed and direct-service fail-closed behavior.
- Three-role desktop and 390px workbench acceptance must use exact options rather than UUID entry and cover loading, forbidden, empty, error and retry states.

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

## Scenario: Reward and discipline immutable approval evidence

### 1. Scope / Trigger

- Trigger: changes to reward/discipline categories, cases, approval actions, external links, or `hr_reward_evidence` files.

### 2. Contracts

- The state machine is exactly `draft -> submitted -> approved|returned|withdrawn`; only `returned -> submitted` may reopen review, while approved and withdrawn cases remain terminal.
- Submission freezes the current category version and every active evidence file associated with the case in the same transaction. Submitted evidence cannot be deleted, reassigned, disabled, or soft-deleted through either the generic file API or direct database mutation.
- `manage` does not imply access to detailed reason, amount, or evidence. Writes to those fields require the matching reason, amount, or document atom; protected file access additionally requires the base reward read/manage atom and generic file permission.
- Team scope is resolved only through the actor's managed organization tree. Employee self-service returns only the employee's own approved minimum projection. Service direct calls without a matching scope fail closed.
- Payroll links target an effective attendance payroll input item for the same employee and exact version. Performance links target a still-open performance plan for the same employee and exact version. A case has at most one immutable link per target type, and link creation never writes the target domain.
- Required audit completes before every sensitive list/detail/file response, including authorized empty lists. Workflow Inbox messages contain only a generic task title and route, never reason, amount, evidence, or disciplinary detail.

### 3. Tests Required

- PostgreSQL-test concurrent approval and link creation, category/case/file inverse immutability, returned resubmission, self-review rejection, cross-tree denial, exact decimal string projection, audit failure, and zero employee/payroll/performance side effects.
- Apply the migration from `template0`, replay it, rehearse the real predecessor upgrade, and run production seeds twice.

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

## Scenario: Historical attendance and insurance read productization

### 1. Scope / Trigger

- Trigger: exposing `hr_attendance_calendar_source/hr_attendance_day` or `hr_employee_insurance_period/item` through `/hr/*` APIs and workbenches.
- Historical attendance calendars are templates without employee ownership. They are not employee punch, schedule, or daily-result facts.

### 2. Signatures

- `GET /hr/attendance/calendars?page&page_size&year&month`.
- `GET /hr/insurance/periods?page&page_size&keyword&year&month&needs_review`.
- `GET /hr/insurance/periods/me` and `GET /hr/insurance/periods/:id`.
- Backend scope resolves to `park | managed_org_tree | self | none` from exact attendance or insurance permissions.

### 3. Contracts

- Never attach an employee ID to a migrated calendar template or describe its dates as actual employee attendance.
- Insurance scope is enforced by tenant, park, and server-resolved employee IDs. A client employee, keyword, year, month, or review filter may only narrow the result.
- `park` may receive employer amounts and item detail; `managed_org_tree` receives employee identity, compliance status, and personal totals without item detail; `self` receives own personal item detail without employee identity or employer amounts.
- Every response is an explicit allowlist projection. Never return source snapshots, legacy IDs, tenant/park, actor fields, remarks, soft-delete, or version columns.
- Attendance and insurance reads use required audit before returning the response. An authorized empty result is still a sensitive read and must be audited; only a true `none` scope may return the fail-closed empty page without recording a successful read.
- A `forceSelf` service option does not create authority. Direct service calls still require the exact self-read permission, superuser, or wildcard authority.

### 4. Validation & Error Matrix

- no relevant read permission -> `none`; list returns an empty page and detail returns safe not-found.
- team permission with an empty managed organization tree -> required audit, then an empty page.
- self route without self-read permission, even when the service is called directly -> empty page.
- foreign tenant/park, sibling organization, or another employee -> safe not-found/empty without target disclosure.
- required-audit persistence failure -> fail before returning data or an authorized empty result.

### 5. Good / Base / Bad Cases

- Good: HR sees a scoped monthly insurance ledger with employer totals; the employee sees only personal items for the same period.
- Base: an `N1` calendar symbol is displayed as an unresolved historical template symbol and remains `needs_review`.
- Bad: label a template day as an employee absence, let `forceSelf=true` bypass permissions, or skip audit because the authorized query returned zero rows.

### 6. Tests Required

- Unit-test `park`, recursive team, `self`, and `none`, including direct service invocation and an employee without a linked account.
- Assert exact response keys for HR, team, and self projections and the absence of employer/item/internal fields at lower scopes.
- Assert audit failure blocks non-empty and authorized-empty responses.
- Contract-test exact controller metadata, production role seed, menu/page guards, and absence of historical write routes.
- Re-run the Yuzhou T3 total-accounting contract, production seed replay, Web/API checks, and desktop/390px browser verification.

### 7. Wrong vs Correct

#### Wrong

```ts
const access = forceSelf ? "self" : resolveHrInsuranceAccessScope(actor);
if (employeeIds.length === 0) return emptyPage; // bypasses both permission and required audit
```

#### Correct

```ts
const access = forceSelf && canReadSelf(actor) ? "self" : resolveHrInsuranceAccessScope(actor);
if (access === "none") return emptyPage;
await recordHrSensitiveRead(auditService, scope, actor, authorizedEmptyAudit);
return emptyPage;
```

## Scenario: Governed online attendance requests

### 1. Scope / Trigger

- Trigger: creating, submitting, cancelling, reviewing, listing, or notifying for leave, overtime, business-trip, and attendance-correction requests.
- This workflow creates online business records only. It never rewrites Yuzhou historical calendar templates or imported attendance evidence.

### 2. Signatures

- `GET /hr/attendance/requests` requires an exact park, managed-team, or self attendance read permission.
- `POST /hr/attendance/requests`, `/:id/submit`, and `/:id/cancel` require `hr:attendance:request`.
- `POST /hr/attendance/requests/:id/approve` and `/:id/reject` require `hr:attendance:approve`.
- Every write route uses replay-aware idempotency and body-free audit metadata.

### 3. Contracts

- The employee identity is resolved from the authenticated user and tenant/park scope; a client never chooses the employee for a self-service request.
- Timed requests require explicit timezone offsets, positive whole-minute boundaries, and a maximum duration of 31 days. The service computes `duration_minutes`; PostgreSQL independently enforces duration, minute precision, and request-type shape.
- State transitions are `draft -> submitted`, `returned -> submitted`, `submitted -> approved|returned`, and `draft|submitted|returned -> cancelled`. Approved, cancelled, and other terminal records are immutable.
- Reviewers cannot review their own request. Team review uses the server-resolved recursive managed organization tree; HR review remains tenant-and-park bounded.
- The employee row is pessimistically locked before overlap checks so concurrent submit or approval decisions for one employee serialize. Submitted and approved requests participate in overlap detection.
- The attendance request, approval projection, approval action, and user message are written through the same transaction manager. Notification failure rolls back the business transition.
- Notifications may identify the request type and workflow state but never copy the reason, medical details, or review comment into message content or payload.

### 4. Validation & Error Matrix

- missing linked employee, foreign tenant/park, or unmanaged employee -> safe not-found without target disclosure.
- self approval -> forbidden; invalid or terminal transition -> conflict; return without actionable comment -> bad request.
- missing timezone, seconds/milliseconds, non-positive interval, duration over 31 days, or wrong correction shape -> bad request before persistence and database rejection if the service is bypassed.
- submitted/approved overlap -> conflict; unique-index race -> translated conflict rather than a raw database error.

### 5. Good / Base / Bad Cases

- Good: an employee submits leave, the direct manager approves it, and the request, action history, approval projection, and privacy-safe inbox message commit together.
- Base: a returned correction request is edited outside this slice only after an explicit edit contract exists; with the current API it may only be resubmitted unchanged or cancelled.
- Bad: accept a client employee ID, let a manager approve a sibling department, capture the reason in generic audit metadata, or publish a message after the transaction commits.

### 6. Tests Required

- Unit-test every state transition, self/team/park/none scope, self-approval denial, team-tree escape, time validation, projection allowlists, required audit, and notification privacy.
- Contract-test exact action permissions, idempotency interceptors, body-free audit, production seed role grants, and Web request guards.
- In isolated PostgreSQL apply and replay the migration and production seed, prove the constraints reject second-level and over-31-day rows, and exercise a two-connection same-employee overlap race.
- Run focused API/Web tests, the Yuzhou T3 compatibility contract, full lint/type-check/build, and desktop plus 390px role UAT when browser viewport control is available.

### 7. Wrong vs Correct

#### Wrong

```ts
await requestRepo.save({ ...dto, employeeId: dto.employeeId, durationMinutes: dto.durationMinutes });
await notifyManager(dto.reason);
```

#### Correct

```ts
await dataSource.transaction(async manager => {
  const employee = await lockActorEmployee(manager, scope, actor.sub);
  const timing = validateAndCalculateServerTiming(dto);
  await assertNoSubmittedOrApprovedOverlap(manager, scope, employee.id, timing);
await saveRequestApprovalActionAndPrivateMessage(manager, employee, timing);
});
```

## Scenario: Training plans, results, corrections, and certificates

### Contracts

- Published course versions and plan snapshots are immutable. Publishing freezes the course/version facts, budget/currency, and participant roster; the only plan transitions are `draft -> published -> in_progress -> completed|cancelled`, and plans are never physically deleted.
- Resolve `park | managed_org_tree | self | none` in the service. Team readers receive no employee/participant UUID, cost, score, assessment, or certificate fields and cannot perform participant actions; self readers see only their own row. Cost and certificate fields additionally require their exact permissions.
- Plan selectors use the exact plan-management permission and return only minimal current course/employee options; they must not depend on broad employee-directory read access.
- Completion/results are immutable. Corrections append exact `numeric(20,4)` deltas and the latest projection is cumulative; state-changing writes, deduplicated privacy-safe `biz_user_message` rows, and audit records share one transaction and pessimistic/advisory locking.
- Certificate files require `biz_type='hr_training_certificate'`, `biz_id=participant.id`, matching tenant/park, active state, exact document permission, and required audit before metadata/headers/stream. Generic file deletion must reject referenced certificates.

### Tests Required

- Contract-test exact controller permissions, body-free audit, safe projections, self-only actions, selector isolation, protected files, and minimal production role grants.
- From `template0`, run migrations through the current training migration, seed twice, and checksum replay; also exercise a real predecessor-to-training upgrade.
- PostgreSQL-test concurrent completion/correction, append-only results, immutable snapshots/terminal states, message atomicity, certificate ownership guards, and zero employee/payroll/performance side effects.

## Scenario: Versioned attendance calculation core

### 1. Scope / Trigger

- Trigger: defining shifts, assigning schedules, ingesting punch events, recalculating employee business days, or reading daily attendance results.
- `hr_attendance_day` remains a migrated calendar template and is never joined as employee attendance truth or mutated by calculation.

### 2. Signatures

- HR operation writes require the exact `hr:attendance:operate` permission, replay-aware idempotency, and body-free audit.
- Daily-result reads resolve only to `park | managed_org_tree | self | none` from exact attendance permissions and require audit before response.
- Punch event identity is `(tenant_id, park_id, source, event_key)`; replay succeeds only when employee, occurred time, event type, source, and device identity match.

### 3. Contracts

- Shift and schedule semantics use the `Asia/Shanghai` local business date. Cross-midnight shifts retain the scheduled start date and an explicit punch window.
- Raw punch events are immutable facts. A reused identity with different content is a conflict, while identical replay returns the original event.
- Every recalculation appends a new immutable calculation version and daily-result row. It never updates or deletes an earlier result.
- Recalculation takes an employee write lock so concurrent calculations serialize and receive distinct versions. Reads select the latest version per employee and business date with deterministic ordering.
- Results retain source event IDs, schedule/shift identity, rule/calculation version, calculation window, and any approved correction request ID. A correction is evidence for a new version, not an edit to an old result.
- Response projections exclude device payloads, source internals, tenant/park, audit actors, soft-delete, version-control internals, and legacy source snapshots.

### 4. Validation & Error Matrix

- missing employee, schedule, shift, or foreign scope -> safe not-found; unmanaged team target -> safe not-found.
- duplicate event identity with changed payload -> conflict; identical replay -> original record without duplicate insertion.
- invalid local date/time, inverted window, or unsupported event type -> bad request/database rejection.
- required-audit failure -> no daily result response, including an authorized empty team result.

### 5. Good / Base / Bad Cases

- Good: an overnight shift starting at 22:00 remains on its scheduled business date, consumes the bounded next-day punch window, and produces a traceable new version.
- Base: a rest day with no events produces an explicit rest classification rather than a fabricated work record.
- Bad: overwrite yesterday's result during recalculation, deduplicate only by a device key without source, or derive employee facts from `hr_attendance_day`.

### 6. Tests Required

- PostgreSQL-test fresh/upgrade/replay constraints, exact event replay, changed-payload conflict, same key across sources, cross-night windows, approved correction trace, concurrent version allocation, latest-only projection, and zero historical-template writes.
- Unit-test local business-date calculations, exception classifications, self/team/park/none access, required audit, and exact projections.
- Contract-test atomic permissions, production seed grants, Web pre-request guards, mobile records, and all write-route idempotency/audit metadata.
- Run T3 compatibility, focused API/Web, full lint/type-check/build, and desktop/390px UAT when viewport control is available.

### 7. Wrong vs Correct

#### Wrong

```ts
await dailyResultRepo.update({ employeeId, attendanceDate }, nextResult);
```

#### Correct

```ts
await dataSource.transaction(async manager => {
  await lockEmployee(manager, scope, employeeId);
  const nextVersion = await allocateCalculationVersion(manager, scope, employeeId, businessDate);
await appendDailyResult(manager, nextVersion, immutableTrace);
});
```

## Scenario: Attendance month close and payroll input snapshots

### 1. Scope / Trigger

- Trigger: opening, calculating, reviewing, closing, recovering, or correcting a monthly attendance period, or reading its payroll-input snapshot.
- This boundary produces attendance inputs only. It never starts a payroll run, pays wages, edits `hr_payslip`, or mutates Yuzhou historical attendance templates.

### 2. Signatures

- Period operation requires `hr:attendance:operate`; final close and post-close correction require `hr:attendance:close`.
- Payroll input reads require the exact high-sensitivity `hr:attendance:payroll_input_read` permission and required audit.
- Period and employee-summary reads continue to resolve server-side `park | managed_org_tree | self | none` attendance scope.

### 3. Contracts

- Period flow is `open -> calculating -> review -> closed`; calculation failure is persisted as `failed` with a standardized code and may be retried after the cause is repaired.
- Monthly aggregation selects exactly the latest immutable daily result per employee and business date using a deterministic tie-breaker. Summary trace freezes every daily-result ID and calculation-version ID used.
- A period with no employee attendance facts fails calculation; it never enters an empty review state that cannot be safely closed.
- Close takes pessimistic locks and creates an immutable effective payroll-input batch and items. Concurrent close attempts produce exactly one effective batch.
- A post-close correction appends new summary versions and a new payroll-input batch, then supersedes the prior effective batch in the same transaction. Old summaries and input items never change.
- Close batches cannot reference a correction or reason. Correction batches must reference the superseded batch and contain a nonblank reason; PostgreSQL enforces this shape.
- `changedEmployeeCount` counts only employees with a nonzero difference in at least one payroll-input metric. A zero-difference correction remains traceable but reports zero changed employees.
- Payroll consumers may read only the latest effective batch of a closed period. Public projections exclude reasons, source traces, tenant/park, audit fields, and internal version controls.

### 4. Validation & Error Matrix

- calculate outside `open|failed`, close outside `review`, or correct outside `closed` -> conflict.
- missing latest daily facts -> persisted `failed`; after facts are appended, retry may produce `review`.
- period/active-batch race or duplicate version -> conflict with full transaction rollback.
- no exact payroll-input permission or required-audit failure -> no sensitive snapshot response.
- any attempt to update prior summary/input rows or touch payroll run, payslip, or historical template tables -> release-blocking failure.

### 5. Good / Base / Bad Cases

- Good: HR calculates from latest daily versions, reviews, closes once, and payroll reads one immutable effective input batch with full private trace retained server-side.
- Base: a correction whose recalculated values are identical creates a new traceable version with `changedEmployeeCount=0`.
- Bad: sum every historical daily recalculation, overwrite batch 1 during correction, expose the correction reason to payroll readers, or treat closing attendance as salary payment.

### 6. Tests Required

- PostgreSQL-test full migration and raw replay, seed replay, latest-daily aggregation, failed recovery, concurrent close, batch shape constraints, correction versions, zero-difference count, unique effective batch, and immutable old rows.
- Assert zero writes to `hr_attendance_day`, `hr_payslip`, and `hr_payroll_run`.
- Unit-test status transitions, self/team/park/none scopes, exact high-sensitive projection, and required-audit failure.
- Contract-test exact route permissions, idempotency, body-free audit, minimal role grants, Web pre-request guards, and mobile records; run full lint/type-check/build and browser UAT when available.

### 7. Wrong vs Correct

#### Wrong

```sql
SELECT * FROM hr_attendance_daily_result WHERE work_date BETWEEN :start AND :end;
-- This includes every historical recalculation version.
```

#### Correct

```sql
SELECT DISTINCT ON (employee_id, work_date) *
FROM hr_attendance_daily_result
WHERE work_date BETWEEN :start AND :end AND is_deleted=false
ORDER BY employee_id, work_date, create_time DESC, id DESC;
```

## Scenario: Lifecycle checklists and sensitive employee extended records

### 1. Scope / Trigger

- Trigger: changing lifecycle templates/checklists/actions, employee family/education/work/skill/credential records, their protected files, migration `000252`, or production HR permission seeds.
- This scenario extends the real `000251_hr_recruitment_preboarding.sql` schema; never edit or assume an empty 000251 baseline.

### 2. Signatures

- Read: `GET /hr/lifecycle/checklists`, `GET /hr/lifecycle/checklists/:id`, and `GET /hr/employees/:employeeId/records`.
- Write: `POST /hr/lifecycle/templates`, `POST /hr/lifecycle/templates/:id/versions`, `POST /hr/lifecycle/checklists`, `POST /hr/lifecycle/checklists/:checklistId/items/:itemId/actions`, and `POST /hr/employees/:employeeId/records`; every write is replay-aware and audited with `captureBody:false`.
- Database: active-only checklist identity `(tenant_id,park_id,employee_id,checklist_type) WHERE is_deleted=false AND status='open'`; offboarding event FK `(tenant_id,park_id,employee_id,employment_event_id)`; action item FK `(tenant_id,park_id,checklist_id,item_id)`; both child FKs require complete non-partial indexes.

### 3. Contracts

- Upgrade preserves every 000251 checklist/item row, including its snapshot and status; legacy rows may retain `template_version_id=NULL`. Only active open checklists are unique. Published template versions/items, checklist snapshots, and action history are append-only.
- An offboarding checklist references the employee's current, effective, nonhistorical `depart` event whose after-snapshot is `departed`; both checklist writes and later event mutation are protected. Checklist work never changes `hr_employee.employment_status`.
- Action, item state, and privacy-safe `biz_user_message` commit through one transaction manager under pessimistic locks; dedupe/replay creates at most one action and message, and messages contain no employee or sensitive-record values.
- Service access independently resolves `park | managed_org_tree | self | none`. `none` fails closed; authorized empty results still use required audit. Sensitive record responses are explicit masked allowlists; encrypted values, plaintext identifiers/contact data, storage internals, and fingerprints never enter responses, logs, messages, or ordinary indexes.
- Lifecycle evidence and credential files require their exact HR document permission plus tenant/park/employee/business scope. Authorization and required audit finish before metadata, headers, stream creation, upload, or delete; generic file/profile/lifecycle-self permissions never substitute.

### 4. Validation & Error Matrix

- second active checklist for employee/type or concurrent duplicate action -> translated `ConflictException`; identical idempotency replay returns the stored result.
- offboarding without the valid current departure event, or later mutation that invalidates a linked event -> reject and roll back; employee status remains unchanged.
- invalid action/state, employee self-waive, unauthorized return/correct/reassign, or foreign/inactive assignee -> `BadRequestException` or `ForbiddenException` without target disclosure.
- cross-tenant/park, sibling team, other employee under self scope, or missing exact file permission -> safe not-found/forbidden before file metadata or stream.
- required-audit or inbox insert failure -> roll back/block the response, including an authorized empty sensitive read.

### 5. Good / Base / Bad Cases

- Good: HR instantiates a published snapshot, an assigned employee completes one item, the immutable action and private inbox message commit once, and later template edits cannot rewrite the checklist.
- Base: a real 000251 open checklist upgrades with `template_version_id=NULL`, unchanged item state, and remains usable without fabricated history.
- Bad: impose permanent employee/type uniqueness, accept any historical departure event, update employee status from checklist completion, expose encrypted/plaintext record fields, or authorize credential downloads through generic file read.

### 6. Tests Required

- From `template0`, run the official migration runner through 000252, production seed twice, and checksum replay; separately seed actual 000251 checklist/item rows and prove the official 000252 upgrade preserves them.
- PostgreSQL-test scoped composite FKs/full indexes, bidirectional departure-event protection, append-only rows, concurrent action/idempotency, exactly one message, and zero employee/user/payroll/performance side effects.
- Unit/contract-test every action transition and self/manager/HR authority; `park/managed_org_tree/self/none`, authorized-empty required audit, exact masked projections, message privacy, and exact file metadata/detail/download/upload/delete authorization before headers/streams.

### 7. Wrong vs Correct

#### Wrong

```ts
await checklistRepo.save({ employeeId, checklistType: "offboarding", employmentEventId: anyOldEventId });
await employeeRepo.update(employeeId, { employmentStatus: "departed" });
await messages.save({ payload: sensitiveEmployeeRecord });
```

#### Correct

```ts
await dataSource.transaction(async manager => {
  const item = await lockScopedChecklistItem(manager, scope, checklistId, itemId);
  await assertExactActionAuthorityAndTransition(manager, scope, actor, item, dto);
  await appendActionUpdateItemAndPrivateMessage(manager, scope, actor, item, dto);
});
```

## Scenario: Yuzhou T5 protected historical records migration

### 1. Scope / Trigger

- Trigger: extracting or loading `accept/family/his/knowhow/ticket/person.photo/docs/course/train/trainhis/jobtrain/bonuscode/bonusrecord/jch_1`, migration `000256`, or the T5 rollback tool.

### 2. Contracts

- Extraction uses a non-`sa`, non-sysadmin login against a read-only SQL Server database, explicit columns, stable keys, a `0700` staging directory, and `0600` files from their first write.
- The pinned business hash is recalculated from canonical catalog and domain facts. A manifest's self-reported hash is never trusted; absent and empty source objects remain distinct facts.
- Every source identity has exactly one loaded or quarantined record map. Enforce total, per-source, quarantine-error, and batch conservation independently rather than deriving one side as a constant remainder.
- Historical rows accept inserts only while the batch is unpublished. Staged counts and rows are immutable; rollback requires a succeeded staged batch, verified rollback point, matching run setting, and an active map whose target ID plus source table, identity hash, and row hash match the target row.
- Lock employee, user, compensation, payroll, payslip, performance, and Workflow Inbox tables against concurrent writes while taking before/after hashes. The loader never writes those online domains.
- Readable file evidence requires a content hash, positive actual size, and detected MIME. Empty/path-only evidence has no content hash and never becomes a download URL.

### 3. Tests Required

- From `template0`, run all migrations and checksum replay, production seed, T0 employee load, then T5 load → unauthorized mutation checks → rollback → reload → duplicate-run rejection.
- Catalog-test scoped foreign keys, full non-partial child indexes, exact insert/update/delete trigger bits, terminal immutability, and file evidence shape constraints.
- Contract-test canonical hash recomputation, staging modes, source identity uniqueness, per-source conservation, salary/online hashes, and absence of online-domain inserts/deletes.

## Scenario: T6 goal execution and work-report review

### 1. Scope / Trigger

- Trigger: changing goal cycles, hierarchical goals, goal progress, work-report submissions/reviews, migration `000257`, their Web workbenches, or production goal/report RBAC.
- Existing `000231/000232` rows are a nonempty compatibility baseline. Upgrade them forward; never edit those migrations or fabricate rewritten legacy content.

### 2. Signatures

- Goal reads/options: `GET /hr/goals`, `GET /hr/goals/me`, `GET /hr/goals/options`, `GET /hr/goal-cycles`.
- Goal writes: create cycle/goal, activate or close a cycle, activate/complete/cancel a goal, and append a check-in. Every write uses exact atomic permission, replay semantics, `captureBody:false`, and scoped locks.
- Report reads/writes: list/detail/action history plus draft, update, submit, return, resubmit, and confirm. Suggestions are submitted snapshots, not goal mutations.
- Database: scoped composite foreign keys use `(tenant_id,park_id,target_id)` and every child has a complete non-partial index with that prefix.

### 3. Contracts

- Access resolves independently to `park | managed_org_tree | self | none`. Goal-management options return only park/team-safe organizations and employees plus `canCreateGroup`; Web must not substitute generic organization or employee APIs.
- Non-managers see only non-draft cycles/goals. A manager with both team and self atoms gets the union for report action history. Query parameters may narrow but never widen scope.
- A parent goal's progress is `SUM(child.weight * child.progress)`; do not divide by the present child-weight sum because incomplete allocation would overstate progress. Cycle-row locking serializes sibling/root weight checks.
- Check-ins are accepted only for active goals. Evidence IDs are not accepted until protected-file ownership, business type, authorization, and required audit are implemented end to end.
- Cycle and goal states move only through explicit actions. Terminal rows, goal versions, actions, and submitted suggestion snapshots are immutable at database level.
- Report content freezes after submit/resubmit. Return permits a new draft revision; confirm is terminal. The state change, append-only action, and privacy-safe Workflow Inbox message commit in the same transaction. A reviewer is not notified about their own report.
- Public projections omit compatibility/source flags, tenant/park IDs, storage/audit fields, and internal version rows. Authorized empty sensitive reads still complete required audit before returning.

### 4. Validation & Error Matrix

- cross-park, sibling organization, other employee under self scope, or direct Service call without an exact atom -> safe not-found/forbidden or empty scope without target disclosure.
- group goal creation without `canCreateGroup`, invalid parent level/date containment, sibling weight above 1, or concurrent conflicting weight write -> validation/conflict and full rollback.
- check-in on non-active goal, close/cancel with nonterminal children, illegal state jump, or terminal mutation -> conflict/bad request; database bypass is rejected too.
- submit empty/invalid report, review outside managed scope, self-review, stale submission action, or terminal report mutation -> validation/forbidden/conflict with no action/message side effect.
- required-audit or inbox insert failure -> block/roll back the response and business transition.

### 5. Good / Base / Bad Cases

- Good: HR activates a group cycle and goal, a manager decomposes it to an employee with scoped options, progress aggregates by frozen weights, and a submitted report plus suggestions is returned/resubmitted/confirmed with one action and one private message per transition.
- Base: legacy goals/reports upgrade with unchanged old-field hashes and matching baseline version/action counts, while remaining readable through explicit projections.
- Bad: fetch all employees to populate a department-manager form, normalize parent progress by only existing weights, expose draft strategy to self roles, update a submitted suggestion, or notify a reviewer about their own report.

### 6. Tests Required

- Run the official `template0` migration path, prerequisites, production seed twice, and checksum replay; separately seed nonempty 000231/000232 fixtures and assert old-field counts/hashes before and after 000257.
- PostgreSQL-test root/child weight concurrency, hierarchy/date constraints, state transitions, terminal immutability, suggestion freezing, append-only actions, complete scoped FK indexes, and direct-SQL bypass rejection.
- Unit/contract-test park/team/self/none including team+self union, exact options scope, draft hiding, exact projections, authorized-empty required audit, notification privacy/deduplication, and zero partial commits on audit/message failure.
- Web-test permission-gated requests, stale-request abort/generation handling, sensitive-state clearing, loading/empty/403/error/retry states, desktop layout, and a 390px mobile record flow.

### 7. Wrong vs Correct

#### Wrong

```ts
const employees = await hrApi.employees(token); // broad directory read
parentProgress = weightedTotal / presentChildWeight;
await reportRepo.update(reportId, { status: "confirmed" });
await messageRepo.save(message); // separate transaction
```

#### Correct

```ts
const options = await hrApi.goalOptions(token); // exact park/team scope
parentProgress = sum(children.map(child => child.weight * child.progress));
await dataSource.transaction(async manager => {
  const report = await lockScopedReport(manager, scope, reportId);
  await appendReportActionAndTransition(manager, report, decision);
  await insertPrivacySafeInboxMessage(manager, report, decision);
});
```
