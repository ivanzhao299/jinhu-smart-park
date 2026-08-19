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
