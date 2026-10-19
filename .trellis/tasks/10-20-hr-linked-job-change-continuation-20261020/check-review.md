# Full-scope independent review: PASS

Workspace: `/Users/mac/.codex/worktrees/hr-team-approval-entry-20261018/jinhu-smart-park`
Branch: `codex/hr-functional-gap-calibration-20261020`
Baseline: `9e96fc106219ca2e849b7c0bb9ca43d866d3de53`

## Findings (fixed)
None. No source, test, or spec repair was required during independent review. The earlier implementer correction distinguishing failed reads from not-found is included in the reviewed final source and final 23-test interaction run.

## Findings (not fixed)
None within this slice. Full-scope source/test/spec review is PASS. Root owns package build/CI/merge/deploy/runtime checks and production role acceptance; those are separate gates, not claims made here.

## Scope and behavior verified
- Reviewed every source/test/spec diff and all new source/test files listed below, against PRD, design, implementation plan, source facts and implementation report; unrelated calibration/parent-task metadata preserved.
- Both receipt and existing-linked-request entries use the actual linked application ID. URL builder encodes it; Server parser rejects blank, malformed and repeated values, normalizes UUID case, and preserves the independent departure employee filter. No invalid target mounts the lifecycle client or falls back to broad reads.
- Actual lifecycle client forwards the separate job-change target to the existing panel. Page/module permissions, list/controller permission atoms, history and all mutation endpoints remain unchanged.
- API DTO validates optional UUID including repeated values. Parameterized `j.id` is ANDed before both count and pagination with tenant/park/deletion/join and existing park/team/self predicates; status/keyword remain narrowing filters. Authorized empty reads still require audit. No bare detail bypass, permission expansion or new write path.
- Full identity plus target keys remount the isolated content. Cleanup aborts old list/options/history reads; alive guard prevents old write completion publishing after unmount. Drafts, opinions, pending original request and confirmed cache cannot bleed across target/identity replacement.
- Same-target unknown outcomes retain original body/token/idempotency key; synchronous lock blocks sibling mutations. Confirmed success remains visible through stale/failed refresh. Target read errors do not assert not-found. Target mode hides unrelated new draft form; ordinary paging and explicit return to full ledger remain available.
- Specs document the exact narrowing/isolation contract. No platform/template/config/env/database/schema/auth change requires extra synchronization.

## Verification
New checker runs (all exit 0):
- API typecheck: `pnpm --filter @jinhu/api typecheck`; `/tmp/hr-linked-check-api-typecheck.log`.
- Web typecheck: `pnpm --filter @jinhu/web typecheck`; `/tmp/hr-linked-check-web-typecheck.log`.
- Scoped API ESLint: DTO, service, new DTO test, new PG test; `/tmp/hr-linked-check-api-lint.log`.
- Scoped Web ESLint: approved employment panel, lifecycle client/panel/page/navigation, hr-api; `/tmp/hr-linked-check-web-lint.log`.
- Current linked-target real PostgreSQL case: `HR_JOB_CHANGE_LINKED_TARGET_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-job-change-linked-target.pg.spec.ts` from `apps/api`, with protected synthetic fixture loaded into environment: **1/1 pass, zero skip**, `/tmp/hr-linked-check-pg.log`.
- `git diff --check`: PASS.

Evidence reused after code/input review:
- `/tmp/hr-linked-api.log`: original **4/4 pass, zero skip**, covering DTO validation, linked target PG, approved-source transaction/concurrency/rollback PG and existing job-change contract. New PG test mtime was later than this original log, so checker reran precisely that case against current source above; other API inputs unchanged.
- `/tmp/hr-linked-web.log`: original **36/36 pass** across four files; `/tmp/hr-linked-web-handoff.log`: final affected continuity file **23/23 pass**, after read-error rendering correction and actual lifecycle handoff assertion. Combined **37 unique passing tests**. Other three suites' sources unchanged; final continuity run covers the modified panel.
- Browser evidence JSON under `/Users/mac/.codex/artifacts/hr-linked-job-change-continuation-20261020`: all four recorded source hashes match current files. Root's actual-component synthetic desktop/390px inspection covers exact record51, returned/approved/applied actions, failed-read retry and return to first20 of51. Exact overflow was not measured; no production role acceptance claimed.
- API/Web `@jinhu/shared` links both resolve to this authoritative worktree's package.

No duplicate full-suite/build execution by checker. Root was already running full package lint/build and HR source contracts. No commit/push/deploy, production calls, historical import, real HR mutations, or other database/port use. Synthetic PostgreSQL schemas cleaned by the passing test; owned container and protected fixture left for root cleanup. Checker log files are mode0600.

## Reviewed file fingerprints
SHA256 below binds this review to final source/test/spec contents; metadata changes do not invalidate these source conclusions.

- `.trellis/spec/api/backend/hr-management.md` — `2de39f1c4138da09f688ed74fd3a7dafb40c81efb7acfeb065ec91b23dbcc20f`
- `.trellis/spec/web/frontend/hr-job-change-operation-continuity.md` — `bd4ae6325f2d88bfda6f787a40438cfa503bbae97d12f19c996840eeea31870b`
- `apps/api/src/modules/hr/dto/hr-job-change.dto.ts` — `506059597417e7f5ea2b66bd89fb0f933fe11dc12b8a6cc57f567399ec968582`
- `apps/api/src/modules/hr/hr-job-change-linked-target.pg.spec.ts` — `1d7f854a88deebadb4c1c629bd526ad81f225cb742ede837829dadf6fea57e70`
- `apps/api/src/modules/hr/hr-job-change-linked-target.spec.ts` — `621b8146a54b8c6deab2c343533d91506e21d0104f63877f4450b060ab60ee14`
- `apps/api/src/modules/hr/hr-job-change.service.ts` — `585a63d87be9813ca129cc2d55326a9fca49e08a855c307e288e67a3a38f54aa`
- `apps/web/app/hr/approvals/ApprovedEmploymentRequestsPanel.tsx` — `4e9c6eece5556fb931532f56e36765f1b0ebd9ec4682c670ef585525cc0cd505`
- `apps/web/app/hr/lifecycle/HrLifecycleClient.tsx` — `3d56387a5f580039022d672eface77d8e7645e5ba4c588aae9454bf5c1cec0d3`
- `apps/web/app/hr/lifecycle/JobChangeApplicationsPanel.tsx` — `63c797b7de0bf6e8d0ebda3bb2a3024dbf39a3433eaf479861080b4828df0d54`
- `apps/web/app/hr/lifecycle/job-change-navigation.ts` — `fc05890de802d3dcc059fb862311674b8aee02b9323078e0dc67092bf3942d9c`
- `apps/web/app/hr/lifecycle/page.tsx` — `75aab2c262c52e5be7f8ee7ce3282a0fdb3684874144dd9726fb2ec2674a5311`
- `apps/web/lib/hr-api.ts` — `f9aac0e5c9d2591ca3b293d825853cf9a28289543cd5f26db921031c9d275633`
- `apps/web/test/interaction/hr-approved-employment-api.test.tsx` — `4b624993bf17cf07bb5996b7530ddbdba633eb443f52fe5813a8910524f360c3`
- `apps/web/test/interaction/hr-approved-employment-fulfillment.test.tsx` — `79864654b5abe1ce91f12e9d9c2c2eaa0869fd625d05ce728cdb7f7a28b49a3e`
- `apps/web/test/interaction/hr-job-change-operation-continuity.test.tsx` — `0e3236739c4ec075163b7e9f04ea96d98e008dae2c55ba9f4bd8b6966e13b430`
- `apps/web/test/interaction/hr-linked-job-change-navigation.test.tsx` — `d93f0d35d4889111caa35b585bb7d84e879ca9f4934e97d4225947b3249852e8`

## Cost Summary
Task: independent exact linked job-change review
Status: PASS; no unresolved source findings
Files changed: this check-review.md only
Tests run: one current real-PG case; API/Web types; scoped API/Web lint; diff check; reused validated API4/Web37 evidence
Retries: 0
Approx model rounds: 10
Repeated scans avoided: no repeat full focused suite or package build; one PG rerun justified by changed test timestamp
Blocked issues: none
Next step: root continues release gates and owns fixture/browser cleanup
Actual token/cost usage: unavailable
