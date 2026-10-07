# Contract-field baseline review

Reviewed on 2026-10-08 in `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`, branch `codex/hr-contract-field-baseline-20261008`, base `d25f1429156bb02e73956ff275b9668ad0b85962` plus uncommitted task changes.

## Findings

No code defect requiring a self-fix found in the bounded service/test change. No source files modified by the reviewer.

- The saved witness hash, complete projection, original receipt/dependency chain and exact target binding are verified before field admission.
- Only incoming fields from the existing seven-term/two-salary maps, absent from all three accepted comparison maps, receive original facts. Present values, including null, are never replaced by the admission branch.
- Preview constructs ephemeral state. Conflict and digest replay paths do not append admission proof. Normal successful encrypted ledger persistence and its value-free revision marker share the existing transaction; action/revision exceptions roll back.
- Existing source comparison, modern-edit preservation, salary permission checks, draft/lifecycle guards, source serialization and conditional business-version writes remain on the actual path.
- The relevant two backend specs and user documentation already describe this bounded exception accurately; no additional spec edit needed.

## Verification

- Reviewer scoped ESLint passed: `pnpm --filter @jinhu/api exec eslint src/modules/hr/hr-yuzhou-incremental-import.service.ts src/modules/hr/hr-yuzhou-initial-baseline.pg.spec.ts`.
- Reviewer focused typecheck passed: `pnpm --filter @jinhu/api exec tsc -p /tmp/hr-contract-import-api-tsconfig.json --noEmit`; config binds this checkout's shared source and includes both changed files. Output: `/tmp/hr-contract-field-review-types.log`.
- Plain `pnpm --filter @jinhu/api typecheck` failed because this worktree's linked `node_modules` resolves stale shared declarations from another checkout, including missing unrelated CANTEEN permissions. No dependency directories were changed. The focused check above corrects local resolution; it is not a full clean-install workspace gate.
- Existing unchanged-source evidence reused: `/tmp/hr-contract-field-baseline-pg.log` 8/8, `/tmp/hr-contract-field-importer-pg.log` 1/1, `/tmp/hr-contract-field-unit.log` 12/12. Reviewed actual scenarios and implementation rather than relying only on test names. The PG log postdates both changed source files and records residual-zero database cleanup. No new lab started.
- Existing pre-fix reproduction `/tmp/hr-contract-field-reproduction.log` fails on the precise false conflict assertion.
- `git diff --check` passed.

Reviewed SHA-256: service `6bf40bfe33ed4ce1a29f5e906f25277fa7efe403055a9397f9e31f801b01c2a0`; PG spec `4e5faff9dfb5b6a62fc7bdcee9390521c8cc1db72b67393d8595164aae47ece8`.

## Boundaries

Review proves bounded local contract-field continuity only. Original receipt migrations are exercised, while business entities use synchronized test fixtures; this is not complete migration replay or real-role UAT. Full clean-install CI, merge/deploy/runtime verification and the overall S0-S7/independent HR program remain incomplete. No commit, push, deployment, production access or source-batch business write performed by the reviewer. No active review run remains.
