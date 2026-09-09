# Implementation Plan

- [x] Freeze `origin/main`, Issue #721, the final HCD report, original audit definitions, existing runner/case file, and retained L-04 artifacts as the baseline.
- [x] Identify the exact UI controls, APIs, product-safe fixture paths, and persistence/readback point for HCD-006/008/009/013/017/025/026.
- [x] Add the minimum declarative real-interaction support and contract tests; add disposable fixture setup without altering production semantics.
- [x] Run targeted static/unit/contract checks before the browser run.
- [x] Inspect existing processes/ports/resources, then start one isolated PG/API/Web/dedicated-Chromium stack using the L-04 recipe.
- [ ] Execute all seven cases at 1440 and 390 with real selection/action, mutation observation, reload/back, and localized echo/error assertions. BLOCKED after two dedicated Chromium connectivity attempts; no third attempt permitted.
- [x] Recompute SHA-256, inspect every screenshot (none generated), scan retained text evidence for secrets/personal data, and teardown only this run's resources.
- [x] Adjudicate all seven cases: all remain FAIL because browser interaction evidence was not obtained.
- [x] Append the seven-case terminal state and evidence index to the UAT report while preserving the prior adjudication history.
- [x] Run `trellis-check`, relevant Web/API/shared tests, lint/typecheck/build gates, and review up to three rounds. Two reviews completed; targeted contracts and lint pass. Typecheck/build are delegated to clean CI because the local shell inherited `NODE_ENV=production` and the root-owned workspace install cannot be repaired without changing ownership.
- [ ] Commit, push only this branch, open a PR closing #721 when justified, wait for CI, squash merge, and observe main under the standing superseded-run/HR-exemption gate without intervention.
- [ ] Close or honestly retain #721, archive this Trellis task, record the journal, and hand off the exact #722 starting point.

## Validation

- `pnpm test:e2e:browser-uat-contract`
- Targeted HCD/shared/Web/API tests selected from the actual touched files
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Isolated seven-case browser run at desktop 1440 and mobile 390
- Artifact SHA-256 recomputation and privacy scan

## Retry and cost controls

- One agent; reuse retained L-04 evidence and scripts; no duplicate monorepo scans.
- At most two automatic repairs for the same root cause, then one focused audit and `COST_GUARD`.
- Record progress and the exact continuation point in this file.

## Local gate result

- PASS: `node --check scripts/go-live-browser-uat-check.mjs`
- PASS: `pnpm test:e2e:browser-uat-contract` (7/7)
- PASS: `node scripts/e2e/property-api-e2e-gate.contract.mjs`
- PASS: `pnpm lint`
- BLOCKED locally: `pnpm typecheck` reached Web and failed only because production-only installation omitted `vitest` and Testing Library. A frozen reinstall was stopped by root-owned `node_modules`; no ownership mutation or further retry was performed. `pnpm build` therefore did not start locally and remains a clean-CI gate.
