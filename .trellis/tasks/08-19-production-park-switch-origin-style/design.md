# Design

## Root Cause

`/auth/switch-context` calls the refresh-cookie origin guard before rotating context. The guard currently accepts only `AUTH_ALLOWED_ORIGINS` or, when empty, `WEB_ORIGIN`. In a same-host production deployment such as `https://park.cnjinhu.com/api/v1/...`, a valid browser request can be rejected if the runtime origin configuration drifts from the actual browser-facing host.

The header park switcher uses a transparent native `select` on a dark header and inherits light text. Native option menus are commonly rendered on a white platform background, so inherited light option text becomes unreadable. Floor and Unit park controls use ordinary native selects and should share the same option hardening rather than duplicate page-local CSS.

## Backend Contract

Keep configured allowlist behavior as the primary cross-origin policy:

- `AUTH_ALLOWED_ORIGINS` remains a comma-separated list of exact origins.
- Empty `AUTH_ALLOWED_ORIGINS` still falls back to `WEB_ORIGIN`.
- Invalid/mismatched origins are rejected.

Add same-origin acceptance:

- Normalize the browser `Origin` or `Referer` origin.
- Normalize the request's own origin from `x-forwarded-proto` plus `x-forwarded-host`, then `host` as fallback.
- If the browser origin exactly matches one request origin candidate, allow the request only when the refresh cookie is host-only.
- If `AUTH_REFRESH_COOKIE_DOMAIN` is configured for a parent domain, require the configured origin allowlist and do not use the same-origin fallback.
- Trust `X-Forwarded-Host` only when `APP_TRUST_PROXY` is set or the direct request host is an internal/private host. Public direct requests use the real `Host` header and ignore spoofable forwarded host values.
- Parse `APP_TRUST_PROXY` with the same disabled-value contract used by API bootstrap, so `false`, `0`, `no`, and `off` do not enable forwarded-host trust.
- Normalize request hosts with the browser protocol during comparison so default ports such as `:443` are removed consistently, and normalize bracketed IPv6 loopback hosts before internal-host classification.
- Continue rejecting malformed origin/referer values and missing browser headers when a refresh cookie is present and missing headers are not allowed.

This preserves CSRF protection because a third-party site cannot make its `Origin` match the real API request host, and parent-domain cookies do not use the fallback. It only avoids failing closed on legitimate host-only same-origin reverse-proxy deployments with stale env values.

## Frontend Contract

Add shared select option hardening in `globals.css`:

- Global native `select option` uses readable form foreground/background.
- Header park switcher options explicitly use white background and dark text because the collapsed control intentionally remains transparent/light on the dark header.
- Mobile terminal park switcher receives the same option treatment.

No separate implementation is needed in Floor or Unit pages; they already call the shared `switchParkContext` helper before scoped writes.

## Compatibility And Rollback

Rollback is the original allowlist-only behavior. The new same-origin branch is additive and limited to cookie-origin verification; it does not change CORS, token rotation, park authorization, or business create payloads.

Production configuration should still be corrected to set `WEB_ORIGIN=https://park.cnjinhu.com` and `AUTH_ALLOWED_ORIGINS=https://park.cnjinhu.com` when appropriate, but the runtime is no longer brittle when the API and Web share an origin.
