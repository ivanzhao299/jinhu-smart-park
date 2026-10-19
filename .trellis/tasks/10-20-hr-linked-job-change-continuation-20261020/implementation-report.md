# Implementation report

Workspace `/Users/mac/.codex/worktrees/hr-team-approval-entry-20261018/jinhu-smart-park`, branch `codex/hr-functional-gap-calibration-20261020`, baseline `9e96fc106219ca2e849b7c0bb9ca43d866d3de53`. Root owns task metadata and parent checkpoint. Implementer did not commit, push or deploy.

## Change
- API DTO adds optional validated `application_id`; existing list ANDs it with tenant/park, deleted, employee join and park/team/self scope before count/paging. Controller permissions, read audit and all mutations unchanged.
- `hrApi.jobChangeApplications` appends optional sixth ID argument, preserving former callers.
- Both approved-source receipt/existing-record links carry their real target ID. Server rejects malformed/repeated `job_change_id` before client mounting; separate ID prop traverses actual lifecycle client to existing panel.
- Identity plus target keys isolate read aborts, draft/review opinion, original-request retry and confirmed-row cache. Existing update/submit/review/apply controls remain on the same record. Target mode hides independent new-draft form and offers return to full ledger. Unexpected other-ID responses fail closed; failed reads do not assert successful not-found.
- API/Web specs updated with the exact narrowing and isolation contracts.

## Changed files owned by implementer
- `.trellis/spec/api/backend/hr-management.md`
- `.trellis/spec/web/frontend/hr-job-change-operation-continuity.md`
- `apps/api/src/modules/hr/dto/hr-job-change.dto.ts`
- `apps/api/src/modules/hr/hr-job-change.service.ts`
- `apps/api/src/modules/hr/hr-job-change-linked-target.spec.ts`
- `apps/api/src/modules/hr/hr-job-change-linked-target.pg.spec.ts`
- `apps/web/app/hr/approvals/ApprovedEmploymentRequestsPanel.tsx`
- `apps/web/app/hr/lifecycle/{page.tsx,HrLifecycleClient.tsx,JobChangeApplicationsPanel.tsx,job-change-navigation.ts}`
- `apps/web/lib/hr-api.ts`
- `apps/web/test/interaction/{hr-approved-employment-api.test.tsx,hr-approved-employment-fulfillment.test.tsx,hr-job-change-operation-continuity.test.tsx,hr-linked-job-change-navigation.test.tsx}`
- This report. Existing task metadata dirtiness belongs to root and was preserved.

## Validation
- API focused run: `node --test --require ts-node/register src/modules/hr/hr-job-change-linked-target.spec.ts src/modules/hr/hr-job-change-linked-target.pg.spec.ts src/modules/hr/hr-approved-employment-job-change.pg.spec.ts src/modules/hr/hr-job-change.contract.spec.ts` with required PG flags, `TS_NODE_TRANSPILE_ONLY=true`: **4/4 PASS, zero skip**. `/tmp/hr-linked-api.log`.
- Real owned PostgreSQL verifies target beyond20, returned/approved/applied, exact employee, tenant/park negatives, recursive managed-child positive/sibling negative, employee self positive/other-employee negative, unrelated actor/no-permission/unknown target/status mismatch negatives, required audit failure. Existing approved-source transaction/link rollback/concurrency regression also passes.
- Web four-file focused interaction run initially **36/36 PASS** (`/tmp/hr-linked-web.log`), then error-empty correction plus actual lifecycle handoff added; latest changed file **23/23 PASS** (`/tmp/hr-linked-web-handoff.log`), yielding **37 unique passing interaction tests** across the four files. Original retry body/key, confirmed write after failed refresh, stale reads/writes, identity/target replacement and exact links retained.
- `pnpm --filter @jinhu/api typecheck` and `pnpm --filter @jinhu/web typecheck`: PASS; logs `/tmp/hr-linked-{api,web}-typecheck.log`. Final Web typecheck for last test addition: `/tmp/hr-linked-web-final-typecheck.log`.
- Targeted ESLint API4/Web6 affected source files: PASS, empty `/tmp/hr-linked-{api,web}-lint.log`.
- `git diff --check`: PASS.
- Root actual-component browser check: receipt/existing target link, returned/approved/applied actions, desktop and390px, failed read retry and normal first20/51 browsing passed. Evidence `/Users/mac/.codex/artifacts/hr-linked-job-change-continuation-20261020/browser-evidence.json` and screenshots. Synthetic data only; production business-role acceptance remains separate.

## Attempts and retained handles
- First PG attempt was started before container initialization completed and failed connection; retained `/tmp/hr-linked-api-initial-startup-failed.log`. After `pg_isready` success, focused4PASS; no business-code workaround.
- Initial API typecheck identified new test array indexing potentially undefined; corrected assertions with optional chaining, then API/Web types and lint passed.
- Root browser found erroneous not-found alongside failed read; fixed render conditional and regression assertion, then focused tests and browser retry passed.
- Disposable PG container `hr-linked-job-change-20261020`, loopback `127.0.0.1:55497`, database `postgres`, retained for checker reuse as root requested. Both test suites create random schemas and drop them on completion. Protected env fixture `/tmp/hr-linked-target-pg-env.json` contains synthetic connection setup; do not print/include it. Root/checker must remove owned container and protected fixture when finished.
- Synthetic browser server PID69416, exec session23625, port18886; fixture source/build/server under `/Users/mac/.codex/artifacts/hr-linked-job-change-continuation-20261020/browser`. Root owns browser QA and later cleanup. No production calls or writes.

## Remaining follow-up
Independent checker, builds and release gates belong to root. No source blocker. No dependency, DB structure, migration, auth or permission change. No historical import or production HR writes. Build/CI/deployment/real production-role business acceptance not claimed by implementer.

## Cost Summary
Task: exact linked job-change continuation
Status: implementation and focused validation passed; root independent review pending
Files changed: scoped source, four interaction suites, two API suites, two specs and this report
Tests run: focusedAPI4; Web37unique; typesAPI/Web; affected lint; diff check; root desktop390
Retries: PG startup1; test type indexing1; browser error-state repair1
Approx model rounds: about20; COST_GUARD used to avoid broad scans/repeated unchanged suites
Repeated scans avoided: no monorepo suite/research duplication; reused root fixture pattern and existing transaction test
Blocked issues: none
Next step: freeze source; root sequential independent check/build/release; dispose owned PG/browser handles
