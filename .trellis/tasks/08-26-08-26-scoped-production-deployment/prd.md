# Scoped production deployment

## Goal

Adopt Phoenix ERP-style change classification so web, API, database and full production releases run only the required build, migration, restart and acceptance gates.

## Requirements

- Classify every production release as `fast-css`, `web`, `api`, `database`, `full`, or `ops-only` from the complete push range and the last deployed SHA.
- Build, migrate, restart, transfer, health-check, and acceptance-test only the components required by that class.
- Fail closed to `full` when the previous production SHA is absent, invalid, or the changed path is ambiguous.
- Database migrations and production seeds must never run in Web-only or CSS-only releases.
- Shared packages, lockfiles, Docker, nginx, workflow, deployment-script, or mixed Web/API changes require `full`.
- Keep deployment serial, preserve rollback snapshots, release markers, protected-account checks, health checks, and Docker cleanup.
- Add executable contracts and synchronize production/release documentation.

## Acceptance Criteria

- [x] Classification is deterministic and covered by positive and negative contract tests.
- [x] Web-only changes do not build/restart API or run database migration/seed.
- [x] API-only changes do not rebuild Web unless a shared/infra dependency requires full deployment.
- [x] Database-only changes run migration/seed and API compatibility gates without rebuilding unrelated Web assets.
- [x] Ambiguous and safety-sensitive changes upgrade to full deployment.
- [x] CI, typecheck, lint, build, contract, and workflow syntax checks pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
