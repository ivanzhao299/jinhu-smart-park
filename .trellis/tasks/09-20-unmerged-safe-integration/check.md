# Integration checkpoint — 2026-09-20

## Scope and source

Baseline: main 69b942b7aae77241cc5728f3553f7d59db137f56. Existing designated checkout only; no other worktree changed. Nine open PR heads preserved through normal merges: #506, #692, #753, #627, #529, #629, #631, #620, #657. No historical production import, source extraction, source receipt mutation, migration renumbering or production setting activation.

## Resolution decisions

- #627 core source was identical to main; only historical validation note added.
- #529 materializer identical to main; retain newer T0/T1/T2/T3 registrations, tests and semantic-revalidation documentation.
- #692 retain both independent Trellis journal sessions; add producer HOLD field and negative consumer test.
- #753 explicit typed test access, stable fallback mode array; portable executable placeholder for rejection-only browser-runner tests.
- #629 default AuthModule remains unchanged; optional writer requires explicit registration, current scope and transaction. Added isolated hosted PostgreSQL CI gate.
- #631 retain employee pagination, legacy-state view, events and employee-specific contract filtering; add family component and date text projection.
- #620 retain current main financial projection and original PostgreSQL scope test; adapt its synthetic identity fixtures to verified T0 owner joins.
- Static code references changed by these reviewed integrations are rehashed from actual file bytes. No source snapshots, private receipts, signed evidence or compatibility credits are changed. Existing unrelated static drift is not silently repaired.

## Verified so far

Dictionary template/preflight passed; Gate-19 retention 13 tests plus snapshot contract passed. Property API 19, Web 52 and shared/runner 15 passed. Auth 192 passed after rebuilding the existing bcrypt native dependency. Family API 5, Web HR 147, family/knowhow 12 passed. Performance focused API 70 passed with 10 opt-in skips; dedicated query-family PostgreSQL 8 passed; original read-scope PostgreSQL 30 passed with no skips; query semantic contract 13 passed. Integrated lint/typecheck passed. Full unit/build and fresh CI remain required before release.

## Preserved development that is not release-ready

- meeting-execution-center a642d39a: #657 includes requirements only. Three local follow-up commits include unfinished backend and migration 000313/000314 that collide with main. Existing handoff explicitly records no actual migration rehearsal and no frontend acceptance. Keep all implementation and .mec-runtime unchanged until migration/permission seed design, migration test and feature gate are complete.
- hr-source-restore-receipt-v1 75ae2ff7: 25 patch-unique commits plus 22 uncommitted paths. Some payroll provenance is superseded by #745, whose self-reader restrictions must survive. Missing contract-change quarantine/piecework changes use colliding 000314/000315 numbers, single-ID foreign keys without composite scope, and partial source behavior. Do not merge this mixed draft into a production release. Preserve source/private artifact owner.
- hr-product-goal-roadmap: 13 uncommitted paths; preserve draft product/legacy isolation edits.
- hr-production-candidates-20260906: 3 uncommitted documentation paths; preserve historical handoffs.
- hr-t3-policy-recovery-v1: one uncommitted allocation research file; preserve.
- main navigation checkout c18e6d50: local handoff plus 3 dirty entries (including private attribution report folder); do not stage personal-data artifacts or local Codex settings.
- hr-position-relation-disposal-v1: all seven affected files are byte-identical to main; no missing feature.
- hr-t2-production-projection-v1: integrated by #634, later improved by #642; do not revert semantic recovery to its old branch. Other clean worktrees have no patch-unique development.

## Independent blockers

Local optional refresh-scope PostgreSQL runner requires >=15 GiB Docker free; currently about 9.9 GiB. No other project's storage is pruned and guard is not lowered. Hosted isolated PostgreSQL must pass instead.
Unrelated pre-existing static evidence drift: employment cross-layer apiService binding was already stale at origin/main. Family direct contracts pass; broad frozen/employment contracts remain an independent evidence maintenance issue, not proof of migration acceptance.
ProductionImport remains HOLD: integration does not solve current formal A/B, preimport snapshot, census, backup/authorization binding or historical data acceptance.

## Next

Finish integrated unit/build/CI and browser checks. Fetch again; merge only validated candidate, deploy with post-health Docker cleanup, verify local=main=runtime identity and health. Then select the next development slice from this preserved backlog against that release baseline.
