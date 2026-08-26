# Phase 2 implementation evidence

## Implemented

- A pre-verification `classify` job selects `ops-only`, `fast-css`, `web`, `api`, `database`, or `full`.
- Verification is package-scoped for narrow modes; full PR CI and Release Smoke scope remain unchanged.
- Production recomputes the authoritative scope and a separately tested gate rejects an under-verified release before source mutation.
- Narrow source transfer is generated from an exact manifest. Component directories retain deletion semantics and exclude generated dependency/build directories.
- Full deployments retain full-tree transfer, rollback snapshot, health, protected-account acceptance, release marker, and Docker cleanup.

## Local gates

- Deployment scope, transfer, verified-scope, route, and path contracts: PASS.
- Migration prerequisite and production seed precedence contracts: PASS.
- Workflow YAML parse and `git diff --check`: PASS.
- Isolated `pnpm install --frozen-lockfile`: PASS; API and Web resolve `@jinhu/shared` inside this worktree.
- Workspace lint, Shared build, workspace typecheck, CSS architecture, unit tests, and production build: PASS.
- API unit summary: 1526 total, 1493 pass, 33 environment-gated skips, 0 fail.
- Web production build: 187 pages generated.

## Remaining release gates

- Fresh fetch and three-end SHA check before commit/PR.
- GitHub CI and required Release Smoke.
- Merge, production deployment, runtime SHA, health, protected-account acceptance, and cleanup evidence.
