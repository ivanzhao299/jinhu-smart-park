# Goal execution operation contexts

## 1. Scope / Trigger
Modern goal operations need draft continuation, cycle/goal state actions and personal checkins. Ordinary team/self list semantics continue hiding drafts. New context reads are authorized by exact operation atoms; no role grant, DDL or state-rule changes.

## 2. Signatures
- `GET /hr/goals/management-context` → `managementGoalContext(scope, actor)`, exact `HR_GOAL_MANAGE`.
- `GET /hr/goals/checkin-context` → `goalCheckinContext(scope, actor)`, exact `HR_GOAL_CHECKIN`.
- Existing cycle actions: POST `/hr/goal-cycles/:id/actions` `{action:'activate'|'close'}`, exact CYCLE_MANAGE.
- Existing goal actions: POST `/hr/goals/:id/actions` `{action:'activate'|'complete'|'cancel',reason}`, exact MANAGE; reason max1000.
- Existing create/checkin/history and their scoped locks, action rows, immutable terminal state and idempotency remain authoritative.

## 3. Contracts
Management response `{items:HrGoal[], parents:Pick<HrGoal,'id'|'cycleId'|'goalLevel'|'goalName'|'startDate'|'dueDate'|'status'>[]}`. Exact MANAGE+READ grants existing park write scope; other managers see only writable department/employee goals (including drafts) in their enabled managed organization subtree. Non-draft group goals are minimal parent references only; group drafts and sibling organizations are excluded. Parent references omit owner and metric/content fields; terminal parents are omitted. Base tenant/park and nondeleted goal predicates precede projection.

Checkin context returns active employee goals owned by the linked current user only, excluding collaborators/other owners/deleted employees. No need for unrelated employee-directory or ordinary goal-read permission. Both authorized empty responses require sensitive work-content read audit; failure rejects response. No new env variables.

Web uses independent authorized abortable resource reads. A manager's actionable records come from management context, never a broad ordinary list. Ordinary reads only support browsing/history. Team drafts have no history shortcut through an endpoint that still hides drafts. Cycle create → activate → goal create → activate → owner checkin → complete/cancel → cycle close use existing actions. Actual response bounds/state shapes are checked before enabling writes. Failed explicit-submit forms keep drafts/reasons and numeric zero. Each opened operation owns a stable idempotency key passed through the existing API adapter. Unknown transport/5xx/409 failures retain the key for exact retry; definitive 400/403/404/422 rejection may rotate it for correction. Explicitly opening a new operation and identity remount rotate the key. Do not mint a fresh key on every retry of goal creation or checkin, which could duplicate a committed record. Successful writes close old forms before optional refresh; failed refresh cannot revert success. Synchronous writer lock disables action/target switching and scope remounts clear state.

## 4. Validation & Error Matrix
| Condition | Expected |
| --- | --- |
| Missing exact context atom | Forbidden before query |
| Team manager requests context | Only own writable drafts; group strategy draft hidden |
| Employee checkin context | Only own active employee goals |
| Empty context | Audited empty projection |
| Required audit fails | Reject response |
| Invalid API projection | Visible read error; no action enabled |
| State moved/children remain open | Existing backend conflict; form and reason retained |
| Write success + refresh error | Committed notice with refresh warning; old action closed |
| Independent list failure | Other authorized resources remain usable |
| Context change/stale response | Abort/generation ignore; remount all sensitive operation state |

## 5. Good / Base / Bad Cases
Good: department manager can activate a scoped draft without granting park goal-read. Base: checkin-only employee records zero current value and zero progress for owned active goal. Bad: use team read to reveal group drafts, or treat a collaborator goal as an owned checkin target.

## 6. Tests Required
- `hr-goal-execution-context.spec.ts`: exact gate before query, authorized empty required audit and failed audit rejection.
- `hr-goal-execution-context.pg.spec.ts`: real isolated PostgreSQL writable subtree, nested/other organization, foreign tenant/park, deleted records, minimal group parent, zero and own active checkins; temporary DB removal.
- Existing T6 state/controller/migration contracts stay valid; unchanged writes retain previously defined database state-machine acceptance requirements.
- `hr-goal-execution-workflow.test.tsx`: actual component cycle-only/manager-only/checkin-only/read-only roles, transitions, terminal controls, retained failed drafts/reasons, writer lock, zero payload, malformed responses, independent failure, history and identity change.
- Web/API lint/typecheck/build; HR regression; real-component desktop/390px shared CSS with visible records/no overflow/44px controls. Synthetic verification is not actual-role or source-equivalence acceptance.

## 7. Wrong vs Correct
Wrong: reveal drafts by widening ordinary SELF_READ/TEAM_READ, or make CHECKIN depend on EMPLOYEE_SELF_READ. Correct: exact operation context bounded by existing write ownership and scopes; leave ordinary reads unchanged.

Wrong: treat creating a draft as the complete goal workflow. Correct: provide explicit cycle/goal transitions and preserve failed operator input; terminal actions remain absent.
