# 补齐园区切换前后端闭环 Implementation Plan

## Phase 1: Issue And Planning

- [x] Create independent branch/worktree from latest `origin/main`.
- [x] Create Trellis task.
- [x] Create GitHub Issue with root cause, phases, and acceptance criteria.
- [x] Backfill Issue number into task notes.

## Phase 2: Frontend Closure

- [x] Read relevant Web/API/shared specs before code edits.
- [x] Extend auth context/layout so successful park switches update the live user context.
- [x] Add current park display and multi-park switcher to user menu/header.
- [x] Force scoped client pages to remount after global park context changes.
- [x] Keep mobile global park switching available as an icon-sized native select.
- [x] Keep terminal-mode pages able to switch park context from the mobile terminal header.
- [x] Keep mobile and terminal park-switch failures visible through compact alert feedback.
- [x] Keep building drawer target-park selection on the existing guarded backend payload path.
- [x] Remove building failed-save logout from drawer-local errors.
- [x] Add park selector to floor create drawer, remove first-building silent default, and switch before loading target buildings/create.
- [x] Reload floor rows after drawer park switches, guard duplicate submits synchronously, and report post-save refresh failures.
- [x] Keep floor drawer mounted during drawer-local park switches by separating session publish from scoped-page remount.
- [x] Serialize drawer-local park switches so park selection, building candidates, and submit context cannot diverge.
- [x] Clear scoped floor/building rows immediately after committed park switches so refresh failures cannot expose source-park records under a target token.
- [x] Keep target form park after a committed drawer-local switch when only the follow-up data refresh fails.
- [x] Invalidate older in-flight floor/building requests across committed park switches.
- [x] Release drawer park-switch locks on both context-switch and post-switch refresh failures.
- [x] Redirect floor list/drawer switch failures to login when the switch helper clears the session.
- [x] Block opening the floor create drawer while list-level park switching is pending.
- [x] Add targeted Web unit tests for floor context switch and asset form failure/success behavior.

## Phase 3: Backend And Runtime Verification

- [x] Evaluate whether ordinary refresh atomic claim can be safely patched in this Issue.
- [x] Keep refresh atomic-claim hardening as follow-up because the user-facing UAT defect is the missing switch UI/adoption path.
- [x] No API behavior changed, so no API unit test changes required.
- [x] Add `scripts/e2e/first-release-context-switch.mjs`.
- [x] Make the context-switch E2E park fixture reusable instead of creating a new park every run.
- [x] Scope default context-switch E2E fixture codes by tenant and runner account to avoid global code/access collisions.
- [x] Add default-park floor isolation check after switching back.
- [x] Verify target-park building/floor reads before switching back to the default park.
- [x] Create per-run building/floor records in the switched park and clean them up after isolation checks.
- [x] Attempt per-run building/floor cleanup from a `finally` path after partial failures.
- [x] Wire new script into `scripts/e2e/first-release-regression.mjs`.
- [x] Document remaining security enhancement as follow-up in the Issue/commentary.

## Phase 4: Validation

- [x] `pnpm --filter @jinhu/web test:unit:auth-session`
- [x] targeted asset page/unit tests
- [ ] `pnpm --filter @jinhu/api test:unit`
- [x] `pnpm --filter @jinhu/web typecheck`
- [ ] `pnpm --filter @jinhu/api typecheck`
- [x] `pnpm --filter @jinhu/web lint`
- [ ] `pnpm --filter @jinhu/api lint`
- [x] isolated runtime frontend UAT for context switch with Chrome DevTools and simulated `/api/v1`
- [x] Codex review first-round findings addressed locally.
- [x] Codex review second-round findings addressed locally.
- [ ] real HTTP context-switch E2E against local API/DB
- [x] Chrome desktop and 390px browser UAT for header switcher and floor create
- [ ] Chrome DevTools post-review recheck after terminal-header CSS change; blocked by unavailable local Chrome debug port.

## Phase 5: PR And Release Closure

- [x] Commit scoped changes only.
- [x] Push branch and create Draft PR.
- [x] Trigger Codex review.
- [x] Address review comments and CI failures.
- [x] Merge after checks pass.
- [ ] Follow production deploy, health/login/context-switch smoke, and Docker cleanup.

## Risk Points

- The current branch must not absorb unrelated dirty files from `/home/jinhuit/JinHuCodebase/jinhu-smart-park`.
- Context switching updates permissions and menus; route refresh/redirect behavior must avoid confusing users.
- Failed context switch must not clear a valid existing session for pre-rotation failures.
- Asset creates must use `getAccessToken()` after `switchParkContext` resolves.
