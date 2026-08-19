# Implementation Plan

## Steps

1. Add request-origin normalization and same-origin acceptance to `apps/api/src/modules/auth/auth-cookie-origin.ts`.
2. Extend `apps/api/src/modules/auth/auth-cookie-origin.spec.ts` for production same-origin acceptance, forwarded host/proto, referer fallback, and hostile origin rejection.
3. Add shared select option readability rules in `apps/web/app/globals.css`.
4. Update `.env.production.example` and `docs/deployment/production.md` with the production origin example and same-origin fallback behavior.
5. Add or update focused static/contract tests for select option hardening if an existing CSS contract exists.
6. Run focused API/Web validation, then browser UAT with Chrome DevTools MCP against local dev pages.
7. Create GitHub Issue, push branch, open PR, request Codex review, address findings, then merge/deploy when checks pass.

## Validation Commands

- `pnpm install --frozen-lockfile`
- `pnpm --filter @jinhu/api test:unit -- auth-cookie-origin`
- `pnpm --filter @jinhu/web test:unit:assets`
- `pnpm --filter @jinhu/web test:unit:auth-session`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/web build`
- `git diff --check`
- Chrome DevTools MCP desktop and mobile UAT for header, floor management, and unit management select controls.

## Risk Points

- Request host/protocol behind a proxy may come from `x-forwarded-*`; tests must cover forwarded headers.
- Same-origin fallback must not accept arbitrary `Origin` values just because they are syntactically valid.
- Select option CSS varies by browser; set explicit option colors at both global and header/mobile switcher scopes.
