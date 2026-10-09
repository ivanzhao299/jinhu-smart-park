# Goal definition and version continuity

## 1. Scope / Trigger
Modern editing of existing goal definitions retains identity, execution values, collaborator associations and immutable historical versions. No historical replay, role grant, DDL or legacy-rule-equivalence claim.

## 2. Signatures
- GET `/hr/goals/change-context`: exact `HR_GOAL_CHANGE`; `{items,parents,canCreateGroup,orgs,employees,cycles}`.
- GET `/hr/goals/:id/change-context`: exact CHANGE; `{goal:{...HrGoal,metricDefinition:string|null},collaborators:{employeeId,employeeName}[],versions:{versionNo,snapshot,changeReason,createdAt}[]}`.
- PUT `/hr/goals/:id`: existing idempotent route; full CreateGoal definition, nullable `targetValue`, positive integer `expectedVersionNo`, nonblank trimmed `changeReason` max1000. Existing controller body-free audit remains.
- Web `changeGoal(id,body,token,idempotencyKey?)`; editor submits the loaded domain version and stable operation key, never the internal database row version.

## 3. Contracts
Exact CHANGE+READ retains park scope; CHANGE-only uses actual enabled managed organization subtree. Both original and new ownership are checked. Knowing another goal's UUID never authorizes moving it into the actor's scope. Context parents retain the original minimal group references. Detail uses an audited read-only repeatable-read snapshot and whitelist history projection. Internal source/row-version fields are not returned.

Mutation locks old/new cycles and parents in stable order before the goal, verifies current domain version and observed relations, rejects terminal goals, and validates new parent scope. Existing original database guards remain authoritative for dates, hierarchy, weights, state and scoped references. Existing children must remain inside the parent's cycle/dates; parent ownership/level cannot change with retained children. Checkins may increment internal row version without invalidating the unchanged definition version.

A successful transaction increments `current_version_no`, adds version/action and required audit, retaining progress/current value. Omitted collaborators preserve them; an unchanged normalized set skips replacement. Changed collaborators require original scope/existence validation. New version snapshots include cycle, parent and collaborator IDs; older missing snapshot fields remain absent, without invented history. No env changes.

Web uses exact operation resources independently of ordinary read/manage permissions. Shared synchronous writer lock covers all goal operations. Details/identity changes abort or discard stale reads. Failed submits retain input/reason/zero; unknown failure reuses key. Committed success closes editor before optional refresh; refresh failure reports a warning without inviting resubmission. Missing current metricDefinition/collaborator projections reject editing. Unavailable current catalog references remain successful retained options. Terminal definitions/history are read-only. Shared DS supports desktop/390px.

## 4. Validation & Error Matrix
| Condition | Result |
|---|---|
| Missing exact CHANGE | 403 before database access |
| Original/new scope outside subtree | 403 without mutation |
| Missing object/new parent | 404 |
| Missing version/blank reason | 400 |
| Stale definition/relations | 409, no overwrite |
| Closed goal | 400, immutable |
| Child dates/cycle or parent ownership invalidated | 409 |
| Original DB hierarchy/date/weight violation | 400 and rollback |
| Required write audit failure | Transaction rollback including versions/actions |
| Read audit failure | No detail response |
| Malformed/mismatched detail | Visible error, no editor |
| Save fails / refresh fails after commit | Retained draft / closed committed form and warning |

## 5. Good / Base / Bad Cases
Good: a manager changes their own department metric using loaded version2, retaining inactive historical collaborators if unchanged. Base: zero target or explicit null remains zero/null. Bad: checking only new ownership, clearing omitted collaborators, or filling absent old snapshots with today's relationships.

## 6. Tests Required
- `hr-goal-change.spec.ts`: pre-query permission/DTO checks, original scope, stale/terminal rejection, retained execution/collaborators, transaction audit contract.
- `hr-goal-change.pg.spec.ts`: disposable loopback DB, original 000231/000257 DDL/guards, concurrent same-version single success, required-audit rollback, child bounds, original-scope denial and immutable history. Dependency catalogs/audit table are fixtures; does not replace full production migration or role UAT.
- `hr-goal-definition-workflow.test.tsx`: actual component CHANGE-only/read-only, full definition/history, nullable/zero and historical associations, failed draft/stable retry, writer lock, terminal view, malformed/missing detail, identity reset and commit-versus-refresh.
- Original goal execution interactions and API contracts; API/Web lint/typecheck/build; HR regression; actual component browser desktop and390px. Production image SHA evidence and actual-role/source-rule acceptance are separate.

## 7. Wrong vs Correct
Wrong: `assertScope(dto); UPDATE ...; replaceCollaborators(dto.ids ?? [])`.
Correct: check stored and requested ownership, compare locked `current_version_no` with `expectedVersionNo`, preserve omitted/unchanged associations, then append immutable evidence and required audit in one transaction.
