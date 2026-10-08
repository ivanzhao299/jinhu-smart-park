# Implementation checkpoint

Workspace: `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`
Branch: `codex/hr-departure-employee-continuity-20261008`
Baseline: `9b83f37a7a40b45468ece6d55bb50fae62e20f97`

Implemented dedicated departure employee-options with purpose-specific permission, park/team scope, small pages, escaped bound search and scoped selected lookup. Original options remains compatible. Separate picker instances retain original IDs and bound editing employees outside pages, ignore aborted/stale reads, and preserve failed uncontrolled drafts via explicit submit events. Departure records display on desktop and phone; picker controls stay touch-friendly. No schema/import/auth/release write.

Evidence logs: `/tmp/hr-departure-continuity-checks/` (private directory). New actual PostgreSQL options fixture passed on exclusively owned loopback15481 database `hr_departure_options_gate`, including521team candidates/page26/E-0501/literal wildcards/selected scope/park exclusion. Existing full lifecycle PG suite was not rerun: it requires full migrated schema; this feature adds no lifecycle mutation logic. APIfocused contract tests and Web actual component interactions cover permissions, retained binding, failure drafts, independent picker state and stale responses.

Shared build and candidate-only dependency links repair borrowed cache resolution; no tracked dependency/lockfile edits. Required final API/Web typecheck and affected lint logs are recorded separately. Parent owns browser fixture screenshots, disposable DB cleanup and serial review. No commit/merge/deploy or production UAT executed by implementer. Production normal-login acceptance remains separate.

## Final checks (2026-10-08)

Reviewer follow-up: page scalar/overflow validation and repeatable private PG schema cleanup repaired; API contracts+actualPG now10/10 PASS and same-DB PG repeat1/1 PASS. Final affected API lint/typecheck PASS; unchanged Web results below remain applicable. See `review.md` for exact fixes, commands and review logs.

- `pnpm --filter @jinhu/api typecheck`: PASS (final exit0).
- `pnpm --filter @jinhu/web typecheck`: PASS (final exit0).
- Affected API and Web `pnpm --filter ... exec eslint <changed TS/TSX files>`: PASS (final exit0).
- API Node contracts: `TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-departure-employee-options.contract.spec.ts src/modules/hr/hr-departure.contract.spec.ts src/modules/hr/hr-departure-filter.contract.spec.ts`: 8/8 PASS, zero skips, `api-tests-final.log`.
- Actual PG: explicit `HR_DEPARTURE_OPTIONS_PG_TEST=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15481 POSTGRES_DB=hr_departure_options_gate`, same Node runner plus `hr-departure-employee-options.pg.spec.ts`: actual fixture1/1 PASS, zero skips, `api-tests.log` (with7initial contracts).
- Web Vitest: `TEST_NODE_MODULES_DIR=/tmp/hr-profile-test-runtime-20261007/node_modules /tmp/hr-profile-test-runtime-20261007/node_modules/.bin/vitest run --config apps/web/vitest.config.ts test/interaction/hr-departure-employee-options.test.tsx test/interaction/hr-departure-navigation.test.tsx`: 11/11 PASS, `web-tests.log`.
- `git diff --check`: PASS.

Retries: one new contract test typing correction; candidate-local environment links repaired missing/stale borrowed modules without changing dependency declarations. UI build initially unavailable from missing localReact resolution; candidate-only UI node_modules now linked for Web typecheck. Full production builds and full lifecyclePG remain deferred to the appropriate milestone. Parent reports desktop/390px synthetic actual-panel acceptance; screenshot evidence and productionUAT belong to parent.
