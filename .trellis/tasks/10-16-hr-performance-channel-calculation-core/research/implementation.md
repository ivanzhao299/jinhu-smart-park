# Implementation handoff — 2026-10-16

Objective: pure exact five-channel and grade snapshot v1 SQL foundation only. Workspace `/Users/mac/.codex/worktrees/hr-goal-report-ledgers-20261016/jinhu-smart-park`; branch `codex/hr-performance-formal-source-weights-20261016`; base HEAD `f5ec67f9829373ce77102676a2226566067b33ed` supplied freshly fetched by root and locally verified. Root owns task metadata, independent review and all commit/release operations. Product ownership released after this handoff; no remaining active check handles.

## Changed files
- `database/migrations/000370_hr_performance_channel_snapshot_core.sql`: two pure immutable invoker functions, strict shape/decimal-string validation, int32/18digit range errors, exact aggregate/rounding math, complete grade selection with ties, PUBLIC EXECUTE revocation and transaction constant self-checks. No fact table reads/writes, roles or legacy helper replacements.
- `apps/api/src/modules/hr/hr-performance-channel-snapshot-core.pg.spec.ts`: opt-in owned tmpfs PostgreSQL test loading frozen300/302/304/321 and exact258 modern helper;21 source total/grade differential cases; complete101details and41+levels; invalid input/range/ACL tests; role without table SELECT successfully executes only after a test-only explicit grant; before/after full fact digests/counts and old function definitions/ACL compare equal.
- `docs/testing/hr-performance-channel-core.md`: commands, evidence limits and parent work remaining.
- `.trellis/spec/api/backend/hr-performance-channel-calculation-core.md`: seven-section executable contract.
- `.trellis/spec/api/backend/index.md`: one relevant link.
- This implementation research note. Parent's existing task metadata changes preserved.

## Dependency provenance
Initial root and apps/api+web node_modules were whole-directory symlinks to `hr-payroll-formal-trial-comparison-20261012`. Only those THREE local symlink entries were unlinked; `CI=1 pnpm install --offline --frozen-lockfile` completed exit0 (session2880,4.8s), no network/upgrades/lockfile change. Shared now resolves inside this worktree; `pnpm --filter @jinhu/shared build` exit0 (39871). No content in the other worktree was modified.

## Actual validations and terminal status
Private raw logs: `/Users/mac/.codex/artifacts/hr-performance-channel-core-20261016`, directory0700/logs0600.
- PG attempt1 /86191: exit1, ts-node TS7053/TS2345 before any DB execution. Original typecheck35697 exit2 for the same types. Fixed detail record return typing and mapped expectation non-null typing; no SQL mathematics changed.
- PG attempt2 /47179: exit1, real owned DB launched then removed;42P08 from reusing one untyped parameter across varchar/char map columns. Fixed synthetic fixture `$4::text`. This is a separate cause from attempt1.
- PG attempt3 /6007: exit0, `pg-3.log`;1 test PASS,0fail,0skip,21 source differential cases plus full rejection/boundary/access/unchanged-state matrix. Container `hr-channel-core-6ac3408c-1c65-40f8-bb3c-b1be068b6d87` created and removed; test asserts its absence. Docker label inventory afterward empty. Final DB run was explicitly enabled with `HR_PERFORMANCE_CHANNEL_CORE_PG_REQUIRED=1`, not a skipped test.
- API lint initial62027 exit0; final90629 exit0, `api-lint-final.log`.
- API typecheck final87659 exit0, `api-typecheck-final.log`.
- `git diff --check`: exit0.
- Static final scan: exactly two CREATE FUNCTION, both IMMUTABLE SECURITY INVOKER / search_path=pg_catalog; two PUBLIC REVOKEs; no SQL INSERT/UPDATE/DELETE/GRANT/dynamic EXECUTE in370. No diff in frozen300/302/304/321, scripts, contracts, packages, package manifests, lockfile or workflows.

No same-cause second failed repair occurred. COST_GUARD followed: focused corrections only; no repeated broad scans/suite runs. Approximately12 substantial implementation tool rounds plus focused completion checks; actual token/cost usage unavailable.

## Remaining boundaries / next action
Root should now run its serial independent Trellis review, then fresh fetch/370 collision review and authorized release flow. No commits/push/actions/production changes executed by this implementer. Full Web/browser, backups/import/routine sweeps and production migration/runtime validation intentionally not run because this slice changes only pure SQL plus API test. Parent formal editable storage/API/UI/workflow/activation remain NOT_IMPLEMENTED here. Actual July trial is NOT_EXECUTED here; user's fixed acceptance is all imported2026-07 payroll, Wu Enguo, calculate-only/no payment, to be carried by root. Full source parity,000309 identity/relationship eligibility, role/channel names and adjustment generation, independent HR acceptance and payroll execution are not proven by this core. Existing bs_ass_compute pending/u_printassessment credit untouched.
