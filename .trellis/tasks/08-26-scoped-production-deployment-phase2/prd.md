# Scoped production deployment phase 2

## Goal

Apply production deployment classification to CI validation and source transfer without weakening release gates.

## Requirements

- Compute the deployment scope before verification so CI can run the correct package-level checks.
- Keep full workspace validation for shared, infrastructure, lockfile, mixed, unknown, and database-sensitive changes.
- Web mode must build/typecheck/lint Web plus shared contracts without running API unit tests or API build.
- API mode must build/typecheck/lint/test API plus shared contracts without building Web.
- Database mode must run database contracts and Release Smoke without rebuilding unchanged Web assets.
- Ops-only mode must run governance contracts and make no production SSH or deployment mutation.
- Transfer only the reviewed files needed by narrow modes; full remains full-tree sync.
- Preserve rollback, release marker, protected-account verification, health, cleanup, and fail-closed behavior.

## Acceptance Criteria

- [ ] Scope is resolved once and consumed consistently by verify and deploy jobs.
- [ ] Narrow CI and transfer paths are executable-contract tested.
- [ ] Release Smoke remains mandatory for database/release-sensitive paths.
- [ ] Unknown or unsafe classifications upgrade to full.
- [ ] Full lint/typecheck/build and workflow checks pass for this infrastructure change.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
