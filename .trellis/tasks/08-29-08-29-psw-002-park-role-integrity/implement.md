# PSW-002 Implementation Plan

## Checklist

- [x] Load API/Web/shared specs with `trellis-before-dev`; record relevant spec context.
- [x] Extend shared `UserParkContext` with optional minimal role summary.
- [x] Add target-aware UsersService authorization helpers and per-park role projection without N+1 queries.
- [x] Add explicit `POST /users/:id/park-roles` DTO/controller/service flow; preserve transaction, protected bindings, idempotency and target audit scope.
- [x] Make role-context reads honor explicit target park under the same target authorization boundary.
- [x] Update user management UI: per-park role status, exact access-only danger text, target park selector, one-step role load/save.
- [x] Update desktop/mobile park switchers to show own target role summary before switching, with non-sensitive fallback text.
- [x] Add API/shared/Web tests for projection, cross-tenant/current-park boundary, protected roles, no-leak response shape, explicit target save and both switchers.
- [x] Run focused tests, shared build, API/Web typecheck, lint/build and relevant full regression in proportion to risk.
- [x] Run `trellis-check`, update specs if an executable convention was learned, and record validation evidence here.
- [x] Commit/push only `codex/fix-psw-002-park-role-integrity`; open PR with `Closes #468`.
- [ ] Complete Codex review in at most 3 rounds, fix findings, wait PR CI green, squash merge, then wait main CI + Deploy Production green and capture Docker cleanup evidence.
- [ ] Close/verify Issue #468, archive PSW-002, fast-forward local tracking state, delete merged branch where safe, prune, then start PSW-003.

## Validation Commands

- `pnpm --filter @jinhu/shared build`
- focused API/Web tests for touched specs
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm lint`
- `pnpm build`
- relevant park-switch/user-management regression entries discovered during implementation

## Risky Files / Rollback Points

- `apps/api/src/modules/users/users.service.ts`: authorization and projection hotspot; keep changes localized and preserve PSW-001 protected-super helpers.
- `packages/shared/src/index.ts`: cross-app contract; build shared before API/Web checks.
- `apps/web/app/system/users/page.tsx`: existing two-request form state is dense; verify create/edit/default-park behavior remains intact.
- `apps/web/components/layout/UserMenu.tsx` and `MobileTerminalHeader.tsx`: keep routing and token rotation unchanged.

## Resume Log

- 2026-08-29: Restored from PSW-001 main double-green. Issue #468 and branch already exist. Four read-only scouts confirmed current default-park coupling, missing per-park projection, switcher contract, and test gaps. Planning artifacts completed; next point is task activation followed by `trellis-before-dev`.
- 2026-08-29: Implementation complete. Added permission-gated per-park summaries, explicit target-park read/write flow, desktop/mobile switcher summaries, and one-step management UI. Focused API 19/19 after final write-path case; Web system 54/54; Web auth-routing 49/49; full API 1582 pass, 40 skip, 0 fail; shared build, API/Web typecheck, API/Web lint and API/Web production build PASS. `git diff --check` PASS. Real desktop/390px browser inspection remains pending because this environment exposes neither the in-app browser nor Playwright; do not report it as passed.
- 2026-08-29: `trellis-check` found and fixed diagnostic leakage: `USER_LIST` alone now receives neither per-park summaries nor role names; Web renders neutral “角色状态不可见” instead of falsely declaring access-only. Added `.trellis/spec/api/backend/park-role-integrity.md`. Next point: workspace gates, commit/push, PR review/CI/merge/main double-green.
- 2026-08-29: Opened PR #470 with `Closes #468`. Codex review round 1 identified four valid gaps: preserve global-super target management, reject blank target park IDs, include access-linked users in an ordinary target-park list, and bound/wrap switcher role summaries for 390px layouts. All four are fixed with focused API 20/20, Web system 55/55, and full API 1584 pass / 40 skip / 0 fail. Next point: final workspace gates, review-fix commit/push, request review round 2, then CI/merge/main double-green.
- 2026-08-29: Codex review round 2 identified four valid closure gaps: ordinary editors opened the user's home park instead of the actor's accessible current park, tenant-super was misclassified as platform-global, summaries exposed other parks, and access-linked discovery materialized an unbounded ID list. Fixed with current-park UI selection/filtering, explicit tenant-super exclusion, current-park-only diagnostics, and database-side `EXISTS` pagination. Focused API 15/15, Web system 55/55, Web auth routing 49/49, API/Web typecheck, and full API 1585 pass / 40 skip / 0 fail. This is the final allowed review-fix round; next point: workspace lint/build, commit/push, reply findings, then CI/merge/main double-green.
