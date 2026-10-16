# Current guard/route inventory before product edits

2026-10-16. Workspace `/Users/mac/.codex/worktrees/hr-payroll-formal-trial-comparison-20261012`; branch `codex/hr-performance-formal-business-20261016`; HEAD `e3528f6f142f9d8c8dd1c0e0dbdf066febcf16fa`; freshly fetched origin/main `f401edacd6049a0b335718df99f8258f763e1d6c`. Dirty paths at intake are root task metadata only. No product edits made before this inventory. Migration372 is currently available; recheck before creating.

## Current authoritative SQL guards

| Function / trigger | Last definition | Existing contract and required extension |
|---|---|---|
| hr_performance_version_guard / trg_hr_perf_version_immutable |371:90/114, replacing258:93 | mode/identity immutable; published frozen; five_channel insert/update draft-only; dimension publication requires weight1 and continuous0..100 levels. Extend via a later migration, preserve dimension branch. |
| ck_hr_perf_template_mode |371:6 | five_channel must be draft with published_at NULL. Activation requires replacing this CHECK as well as guard. |
| hr_performance_channel_cycle_guard / trg_hr_perf_channel_cycle |371:137/141 | rejects all cycles referencing five_channel. Extend to require published/frozen exact definition and workflow identity. |
| hr_performance_channel_revision_guard / trg_hr_perf_channel_revision |371:115/131 | append-only, current draft only, parent→version locking, predecessor sequence/CAS; retain freeze and historical immutability. |
| hr_performance_channel_head_guard / constraint trigger |371:132/136 | atomic deferred head advancement; retain. |
| hr_performance_channel_child_guard / dimension+level triggers |371:142/146/147 | rejects mixed dimension children; retain. |
| hr_performance_template_guard |258:87 | stable code/name and immutable parent identity; retain. |
| hr_performance_child_freeze_guard |258:107 | published dimension/level children frozen; retain. |
| hr_performance_cycle_freeze_guard |258:110 | cycle identity/stage transitions/frozen snapshot; needs explicit correction identity/frozen mode validation in additive guards. |
| hr_performance_cycle_employee_guard |259:8, replacing258:118 | employee snapshot/identity immutable, insertion only planning, stage transitions. Extend mode/input/correction binding while preserving old behavior. |
| hr_performance_evidence_guard |258:128 | evidence append-only and planning-only; not a channel input store. |
| hr_performance_submission_insert_guard |259:146 | always invokes dimension snapshot_score, computed_score nonNULL numeric7,2. Needs mode dispatch/input revision/phase and actor checks. |
| hr_performance_calibration_entry_insert_guard |259:161 | before_score nonNULL manager score/previous entry; dimension math only. Must permit NULL early before-score for five_channel and bind complete input evidence. |
| hr_performance_cycle_employee_result_guard |259:193 | confirmed immutable; final required after calibration; validates only when score or code changes. Must always validate full input revision/grade/level-name evidence, including same-score changes. |
| hr_performance_calibration_batch_guard |259:174 | draft→active→completed and completed immutable. Existing complete API finalizes entire pending cycle. |
| hr_performance_participant_insert_guard |259:157 | participant membership frozen after draft. Retain actual actor relation intersection. |
| hr_performance_appeal_guard |259:184 | immutable submitted identity, submitted→upheld/rejected. Existing resolve API assumes dimension scores for upheld. |
| hr_performance_append_only_guard |259:139 | submissions, calibration participant/entry, review actions immutable. Retain; new revisions append-only. |

A scoped search of all later migrations found no later overrides of259 submission/calibration-entry/result/cycle-employee guards. Later300–321/305–309 functions are source fact/qualification lineage; do not modify them.370 is exact pure math/grade core, not an authorization or lifecycle implementation.

## Existing persistence constraints that must evolve

- employee self_score/manager_score/calibrated_score/final_score numeric(7,2), range0..100; final level code varchar32 (channel candidate code permits64), name64.
- submission computed_score numeric7,2 NOT NULL; dimension_scores and dimension_comments JSON object NOT NULL.
- calibration before_score/after_score numeric7,2 NOT NULL; dimension_scores JSON object.
- employee final shape requires all four final score/code/name/time fields simultaneously present. Preserve that final invariant; do not allow incomplete five_channel finalization.
- current snapshots expose mode/config revision but have no independent frozen detail definitions, master-field policies, current input revision or result input evidence.
- master source self_appraisal/appraisal/description are varchar500; source_pay is numeric19,4 and must remain independent of score math/payroll approval.

## Routes/services and current dispatch points

Controller `hr/performance-v2`:

- templates GET/detail/options; template creation, dimension new-version, channel creation/new-version/definition revision/history; publish uses existing TEMPLATE_MANAGE/Idempotency/Audit decorators.
- cycles GET/create/publish: review service snapshots published template and publishes all active employees in applicable orgs. No correction selection path currently exists.
- score-preview currently templateVersionId + dimensionScores, dimension math only; channel explicitly rejected byB.
- review-page/reviews/actions/reward-evidence: evaluation projection is dimension-specific; salary must never be embedded into unrestricted result/action snapshots.
- reviews/:id/self-review, manager-review: evaluation service always scores immediately, inserts submission, advances employee then aggregate cycle.
- calibration-batches create/options/list; :id/entries always accepts dimensionScores; :id/complete currently scans all pending employees and fails entire transaction if any lacks evidence.
- reviews/:id/acknowledge and /appeals, appeals/:id/resolve: same existing lifecycle; upheld currently requires raw dimensionScores, rejected preserves final result.
- No channel input PATCH/history/current/detail preview routes or confirmed-review correction route yet.

Web `HrPerformanceClient` has captured attempt/token/key retry for ten writes, dimension-number forms, shared lock, keyed identity workspace. Add channel detail/editor/history and correction using the same lock/receipt discipline. `PerformanceTemplates`/definition editor currently deliberately suppress publish and label channel draft-only; enable only after all service/SQL/UI paths are integrated. Result exports need mode-aware projections and precision rather than casting18digit values through Number.

## Architectural contradictions sent to root before product edits

1. Definition schema1 has items but no detail definitions; duplicate-item multiple detail IDs need explicit creation/frozen identity contract.
2. No published policy exists for salaryReference or three master texts, despite required policy∩permission enforcement. Suggested separate versioned workflowPolicy to extend B without altering371/schema1.
3. appealed stage cannot PATCH under self/manager/calibration-only policy; upheld recompute needs explicit restricted appeal-review input amendment policy.
4. completeBatch currently finalizes all pending employees atomically, conflicting with isolated missing-review behavior. Suggested explicit selected review IDs and per-review atomic finalize while batch remains active until remaining reviews finish.
5. Optional earlier-stage UNPROVIDED fields cannot be repaired once stage advances, yet final requires complete fields. Root must choose an explicit audited completion/return path; no silentNULL or unauthorized calibration takeover.

## Runtime DB role evidence boundary

`apps/api/src/app.module.ts:143` uses POSTGRES_USER (defaultjinhu); `.env.production.example:45` documentsjinhu. These are configuration defaults, not live runtime identity. Root was asked to provide safe current_user/session_user and370has_function_privilege/owner evidence from existing read-only release material. No credential, production query or release-runner access performed here. New functions remain SECURITY INVOKER; noPUBLIC EXECUTE or SECURITY DEFINER expansion.

## Validation plan / remaining boundary

Owned isolated PostgreSQL with actual258/259/371 and later additive migration, real HTTP pipes/permission/idempotency/audit, full cross-stage/input revision/same-score evidence/appeal/correction/salary projection matrix plus old dimension lifecycle. Preserve source function definitions/ACL/fact hashes; do not rerun full source mathematics/import/212inventory. Actual components then shared/API/Web lint/typecheck/build; root independently owns native desktop390px/release. Parent source qualification/incremental/full role UAT/July all-books calculate-only remain outstanding.

## Root decisions received after inventory

- Separate append-only workflowPolicy revisions, full detailDefinitions{id,itemId} with known item and independent repeated-item detail IDs; same-version dual pointer CAS. Publication and cycle freeze bind both current revisions atomically; schema1/371 file unchanged.
- Explicit four masterPolicies and per-field appealReviewAllowed boolean, unconfigured cannot publish. Salary keeps performance-scope plus payroll detail/compensation permissions, all response/history/action/audit projections remove unauthorized amounts.
- Nonself APPEAL_REVIEW actor in pending appeal may amend only fields explicitly appealReviewAllowed; scope and salary intersections still rechecked.
- Complete calibration accepts explicit reviewIds and returns per-review atomic results. One incomplete employee does not rollback others. Batch remains existing active until no pending calibration employees remain, then existing completed. Retry cannot re-finalize completed employees.
- Stage submission requires every mathematical number in that stage VALUE or legally EXPLICIT_NULL; required=true requires VALUE. required=false allows explicitNULL only with allowExplicitNull and evidence. required=true plus allowExplicitNull=true is contradictory at publish. Future calibration-stage fields are not required in self/manager. Optional texts are not mathematical-completeness gates. No new return-state machine.
- Preserve370ACL. Actual API connection uses has_function_privilege(current_user, explicit regprocedure,'EXECUTE') before channel publication/calculation and fails clearly when unavailable; no dynamic grants/hardcoded production role. Defaults are not production role proof. Root owns later real connection acceptance.
