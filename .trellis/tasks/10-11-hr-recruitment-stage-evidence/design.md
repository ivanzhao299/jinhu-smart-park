# Design

Reuse hr_candidate_action append-only sequence/evaluation and existing moveCandidate/IdempotencyInterceptor. Add a narrowly scoped read route; approved existing HR candidate-read permission also already reads latestEvaluation. No auth architecture or schema work.

Read candidate existence, total, page and actor labels through one REPEATABLE READ snapshot; explicitly constrain all joins by tenant/park/candidate and exclude deleted parent. Required audit records only field groups/projection/count using same manager, never evaluation content. Do not include sensitive candidate contact details.

A focused CandidateStageHistory component is suitable for independent paged loading/abort/retry. Integrate stage evaluation into current HrRecruitmentClient, retaining existing parent busy/upload lock and exact-operation attempt. On matched write receipt update selected/list stage and evaluation directly, keep successful acknowledgement separate from history reload errors. Do not call broad load() that immediately clears selection/draft and hides receipt. Preserve existing conversion and onboarding controls.

Follow existing receipt/continuity patterns in contracts/lifecycle instead of a new generic workflow engine. Types can follow current hr-api local explicit contract convention. Do not refactor unrelated minified page code.

Rollback is application version only; no new persisted business facts until a real authorized HR user operates existing stage mutation. Old action history remains append-only. Full legacy interview scheduling/result rules remain separately unverified.
