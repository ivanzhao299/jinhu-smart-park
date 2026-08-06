# Implementation plan

- [x] Define shared permissions and issue contracts.
- [x] Add forward-only migration and `admin-issues` Nest module.
- [x] Implement scoped create/mine/admin/triage endpoints with idempotency and audit.
- [x] Implement lease-protected Runner ready/claim/result projection with evidence gates and expired-claim recovery.
- [x] Add global feedback component, personal status view and permission-gated administrator triage to DashboardLayout.
- [x] Add Studio managed-project adapter mapping approved issues to the existing autonomous-development contract.
- [x] Add API and Studio adapter regression tests.
- [x] Run lint, typecheck, build, migration static review and unauthenticated browser rendering check.
- [ ] Run authenticated desktop/390px UAT against a disposable environment.
- [ ] Commit on isolated branches, open PRs, reconcile current-main divergence, and deploy only after release gates pass.

## Rollback points

- UI entry can be removed without data loss.
- Runner adapter can be disabled independently; approved issues remain pending.
- After production records exist, rollback is application-only and preserves audit rows.
