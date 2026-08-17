# 修复招商租赁用户字段手填问题

## Goal

Resolve online UAT feedback that招商租赁 forms expose internal system user IDs
or names as manual inputs. Operators should choose visible business user labels
from existing authorized user candidates, while requests still submit the
selected user ID expected by existing APIs.

## Requirements

- `/leasing/leads` lead list filter must not ask operators to type a跟进人 ID.
- `/leasing/leads` create/edit lead drawer must replace manual跟进人 ID and
  跟进人名称 inputs with a user selector.
- `/leasing/leads` visit form must replace manual接待人 ID and接待人名称 inputs
  with a user selector.
- `/leasing/lead-pool` assignment drawer must replace the current free-entry
  user ID datalist with a strict user selector.
- `/leasing/funnel` follow-user filter must not allow arbitrary user ID entry.
- User selector options should reuse existing authorized reference data for
  enabled users in the current tenant/park scope.
- Visible option labels should use user-facing names, not internal database IDs.
- Submitted payloads must remain compatible with current API contracts.
- Do not change unrelated leasing, finance, auth, migration, seed, or production
  behavior.

## Acceptance Criteria

- [x] All identified招商租赁 user fields render as selection controls rather than
      text inputs or free-entry datalists.
- [x] Selecting a user stores/submits the correct user ID and auto-derives the
      matching display name where the existing payload still carries a name.
- [x] Clearing optional filters/forms remains possible where existing behavior
      allowed empty values.
- [x] Existing line-of-business API payload shapes continue to work.
- [x] A code search finds no remaining招商租赁 form labels/placeholders asking for
      manual user ID/name entry for跟进人、接待人, or assignment target.
- [x] Web lint/typecheck or the smallest reliable equivalent validation passes,
      or any skipped check is reported with the reason.

## Notes

- Referenced task `019feed8-9c37-7400-b37e-0cf77f44ba6f` was read only for
  workflow style. Its organization-hierarchy business content is out of scope.
- Attached screenshots were unavailable from the provided local paths, so the
  task proceeds from the written issue description plus repository scan results.
- Repository scan identified the affected files:
  `apps/web/app/leasing/leads/page.tsx`,
  `apps/web/app/leasing/lead-pool/page.tsx`, and
  `apps/web/app/leasing/funnel/page.tsx`.
- Validation note: with the user-provided WSL Node/pnpm path,
  `pnpm --filter @jinhu/web typecheck` and
  `pnpm --filter @jinhu/web lint` passed.
- `pnpm --filter @trellis-check exec pwd` was retried and reported no matching
  workspace project named `@trellis-check`.
- Code search and `git diff --check` passed for the changed files.
- Real browser verification passed through Windows Chrome `--headless=new` with
  a random CDP port and isolated temporary user data directory, checking
  `/leasing/leads`, `/leasing/lead-pool`, and `/leasing/funnel` at desktop and
  390px mobile metrics for route stability, expected text, removed manual user
  ID/name prompts, select controls, and horizontal overflow.
- Follow-up local full verification ran both services:
  - Docker Desktop was accessible from WSL through Windows `docker.exe`; the
    Linux default `/usr/bin/docker` context pointed at missing
    `/var/run/docker.sock`.
  - `jinhu-smart-park-postgres` was healthy and API `/api/v1/health` plus
    `/api/v1/ready` passed.
  - API was started on `APP_PORT=3101`, Web was started on `WEB_PORT=3017`, and
    Web pointed at the real API target.
  - Real API SMS mock login succeeded for local admin, and
    `/reference-data/form-options`, `/leasing/leads`,
    `/leasing/lead-pool`, and `/leasing/statistics/funnel` were checked with a
    real bearer token.
  - Browser verification was rerun with `REAL_API=1`; it created a temporary
    leasing lead, moved it into the public pool, opened the assignment drawer,
    then soft-deleted the temporary lead during cleanup.
- A mock-mode exploratory browser run was not used as a final gate because the
  running real API authentication path redirected the synthetic mock token to
  `/login`; the final accepted browser gate is the real Web+API mode.
