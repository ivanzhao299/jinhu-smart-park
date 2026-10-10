# 员工敏感档案连续维护

## Goal
Imported and newly created employee profiles share ordinary authorized maintenance. Preserve all existing profile fields and exact permissions, make saves and retries reliable without discarding drafts or falsely claiming writes failed.

## Acceptance
- Existing full profile editor remains available for authorized users with the same fields and constraints.
- Unknown save outcomes retain the exact employee/version/body/key/token attempt; freeze editing and directory context until retry resolves. Retry uses the original request. Known rejected writes preserve editable input; 409 preserves input and requires explicit latest-version reload.
- Require returned employee identity, full projection, and expected next version before claiming success. A matched server profile is the saved receipt; a follow-up read failure does not discard it or clear editable fields. Read retry never repeats the write.
- Suppress late/unmounted/context-changed callbacks, prevent duplicate submissions synchronously.
- Desktop and 390px controls use the shared Design System without overflow. Actual component tests prove lost response, malformed receipt, saved read failure/recovery, conflict and field preservation.
- Batch the documented PR936 audit reference metadata correction, without changing write behavior.

## Boundaries
No production business test mutation, no role/auth changes, no database migration, no payroll rules or payment, no historical import rework. Production role UAT remains separate.
