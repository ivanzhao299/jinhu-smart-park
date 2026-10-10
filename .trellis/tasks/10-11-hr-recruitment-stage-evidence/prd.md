# 招聘阶段评价与办理轨迹

## Goal
Make the existing recruitment stage evaluation and immutable action facts usable in the modern HR page. Current moveCandidate persists evaluation/hr_candidate_action, but UI sends only toStage and no history API/page exists. HR should record decision context, see all prior actions, and continue safely after uncertain writes or failed history refresh.

## Acceptance
- Expose a paginated candidate stage-action read on the existing recruitment controller/service. Require existing HR_CANDIDATE_READ before probes. Candidate must exist, nondeleted and same tenant/park; cross-scope/deleted/missing must reject. No sensitive-contact read dependency or additional permissions/grants.
- Return explicitly whitelisted action identity/sequence, from/to stages, optional evaluation, occurredAt and business actor label. No encrypted/plain contact/identity data, unrelated candidate rows or raw actor IDs shown. Preserve immutable history; no new tables or migration.
- Count and rows use one consistent transaction and deterministic sequence/id order; required read audit in the same transaction, metadata/counts only. DB/audit failures propagate. Bounded page/page_size validation, complete history without an implicit first-page cap.
- Modern selected-candidate surface provides optional evaluation max2000 and latest evaluation display using existing stage mutation. Chinese labels, DS cards, no stage-machine changes or automatic hiring. Read-only users can inspect history without stage buttons.
- Mutation failure retains evaluation and exact operation key for unchanged identity/fromStage/toStage/body, changed request uses new key. Match returned id/fromStage/toStage before clearing draft/key or updating current candidate. Preserve request payload across an uncertain response. Successful write remains acknowledged even if subsequent history read fails; read retry never resubmits mutation.
- Success advances the selected/list candidate from the matched persisted receipt, clears consumed evaluation, refreshes history and leaves the current candidate available. Candidate/user/permission switch and unmount abort/ignore old history/writes, clear prior candidate data; all parent actions respect existing busy/upload locks.
- Tests exercise API permission-before-query, foreign/deleted, DTO bounds, multi-page completeness, no-contact projection and audit failure; UI evaluation payload, unchanged-key retry, changed-body rotation, mismatched receipt rejection, stale read/scope switch, read-only role and write-success/history-failure recovery.
- One true full-original-schema isolated PG test using actual legal stage mutation/history service within rolled-back fixture; test valid screening→interview→offer history with page_size=2 to prove the second page. Do not manufacture23 legal transitions where the existing acyclic state machine permits only a few; UI long-page synthetic fixtures are projection tests only. Root is sole DB lifecycle/runner. Browser actual recruitment page desktop and390 synthetic component validation, no horizontal overflow.
- Fresh baseline, independent check, CI, merge/deploy/runtime/health/cleanup proof. No production HR test writes, payroll calculation/payment, password resets/grants or historical replay.

## Source and limits
Current actual code proves an existing modern capability gap. Relevant legacy recruitment IDs25/26 (面试记录/结果) stay partial: generic stage evaluation is not complete interview scheduling/scoring/report parity. Do not inflate source parity or UAT credit. Recruitment create/convert/onboarding operations retain existing behavior; their broader retry audit is separate and must not be silently claimed fixed.

Wu Enguo owns actual latest-complete payroll/rules and calculate-only acceptance; this independent business work continues.
