# Progress

- GitHub Issue: #345
- Branch: `codex/fix-login-home-landing`
- Implementation: desktop superuser landing now prefers `/dashboard`; mobile ordering unchanged.
- Validation:
  - `pnpm --filter @jinhu/web test:unit:auth-routing` — 13/13 passed.
  - `pnpm --filter @jinhu/web typecheck` — passed.
  - `pnpm --filter @jinhu/web lint` — passed.
  - `git diff --check` — passed.
- Browser verification: not run. This is a pure routing helper change and the available environment has no authenticated production-like browser fixture; no browser result is claimed.
- Remaining gates: PR review, branch CI, squash merge, main CI, Deploy Production health and cleanup logs, Issue closure, local branch cleanup.
