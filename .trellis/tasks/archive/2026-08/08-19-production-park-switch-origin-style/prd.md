# 修复生产园区切换 Origin 与样式问题

## Goal

Production UAT must be able to switch park context from the global header, Floor Management, and Room/Unit Management without a false `Invalid request origin` rejection, and all park select controls must remain readable when the native option menu is opened.

## Requirements

- Confirm the production failure mode:
  - `POST /api/v1/auth/switch-context` returns 403 with `Invalid request origin`.
  - The failure affects the global header park switcher and scoped page switchers used by Floor Management and Room/Unit Management.
- Preserve refresh-cookie CSRF/origin hardening:
  - Do not disable origin checks globally.
  - Do not hard-code one production domain as the only valid origin.
  - Allow browser same-origin requests where the request `Origin`/`Referer` matches the request host/protocol, while keeping configured allowlist support for cross-origin deployments.
- Fix select readability:
  - The global header park switcher must not render native options as white text on a white menu.
  - Floor and Room/Unit page select controls used for querying and creating scoped records must remain readable.
- Keep the existing scoped write contract:
  - Floor and Unit creation must still switch auth context before the write and must not submit trusted `parkId` in the business create body.
- Complete the delivery loop with Issue, branch, validation, PR, Codex review, and browser UAT through Chrome DevTools MCP.

## Acceptance Criteria

- [ ] A request with `Origin: https://park.cnjinhu.com` and matching production host/proto is accepted by the refresh-cookie origin guard even when `AUTH_ALLOWED_ORIGINS`/`WEB_ORIGIN` do not include that origin.
- [ ] A mismatched origin is still rejected.
- [ ] A matching `Referer` fallback is accepted when `Origin` is absent.
- [ ] Production docs/env examples explain configured origins and same-origin fallback.
- [ ] Header, floor, and unit select option menus explicitly use readable option foreground/background colors.
- [ ] Existing floor/unit park-switch-before-write tests continue to pass.
- [ ] Chrome DevTools MCP UAT covers at least the rendered header select and affected floor/unit pages.
- [ ] GitHub Issue and PR link this root cause and the validation evidence.

## Notes

- User-provided clipboard image path was not readable in this environment, so visual evidence is taken from the written UAT description plus browser verification.
- Current production `.env.production` is not committed. The code fix must tolerate same-host reverse proxy deployments without requiring emergency origin-check disablement.
- GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/314
- Chrome DevTools MCP UAT evidence:
  - desktop `/assets/floors`: header park option `rgb(8, 26, 44)` on `rgb(255, 255, 255)`, no horizontal overflow.
  - desktop `/assets/units`: header, filter, and create dialog park options use readable dark text on white background.
  - mobile 390px `/assets/units` and `/assets/floors`: no horizontal overflow; header option remains dark text on white background.
