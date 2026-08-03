# Implementation Plan

1. Load Web/API/Trellis rules for the affected layers and inspect current tests and reusable helpers.
2. Implement #209 runtime collection normalization and safe execution-detail state transition; add malformed/normal projection regression tests.
3. Implement #215 shared cascade helpers and apply them to inspect-point form and filters; add parent-change regression tests.
4. Implement #216 explicit tenant-park option loading/readiness and valid-default selection; add asynchronous option-state tests.
5. Implement #217 effective plan-catalog API and switch tenant onboarding to it; add scoped/global dedupe and frontend endpoint contract tests.
6. Add the new Web system unit-test command to the root gate and synchronize testing documentation if needed.
7. Run targeted tests after each issue, then Web/API unit tests, lint, typecheck, build, and `git diff --check`.
8. Inspect affected pages on desktop and 390px width with the in-app browser; record any environment block precisely.
9. Run `trellis-check`, update reusable specs for confirmed prevention rules, commit only task files, push the branch, create a Chinese PR closing all four issues, and request Codex review.
10. Process actionable review feedback with root-cause verification and repeat the relevant quality gates; do not auto-merge.

## Validation

- `pnpm --filter @jinhu/web test:unit:safety`
- `pnpm --filter @jinhu/web test:unit:system`
- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web build`
- `pnpm --filter @jinhu/api build`
- `pnpm test:unit`
- `git diff --check`

## Risky Files And Rollback Points

- `apps/api/src/modules/saas-modules/*`: preserve scoped CRUD while adding catalog reads.
- `apps/web/app/system/users/page.tsx`: avoid stale tenant candidates and uncontrolled-select timing bugs.
- `apps/web/app/safety/inspect-tasks/*`: preserve field-policy attachment omission semantics.
- `package.json` and testing docs: only add the new system unit gate; do not alter release workflow behavior.
