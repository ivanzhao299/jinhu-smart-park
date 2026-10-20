# Employee birthday and hire-anniversary reminders

## 1. Scope / Trigger

Formal employee dates drive manually generated birthday / hire-anniversary reminders. This is a separate domain from contract expiry. No birthday guessing, source-profile mutation, scheduled broadcasting or external messaging. This feature does not prove full Windows/GroupWeb reminder parity or real-role business acceptance.

## 2. Signatures

- `POST /hr/employee-reminders/preview|generate`: `{kind,windowDays,leapDayPolicy,recipients,businessDate?}`.
- `GET /hr/employee-reminders`: `kind?`, `status?`, `window_days?`, `page`, `page_size`.
- `GET /hr/employee-reminders/:id`: exact authorized record plus ordered `actions`.
- `POST /hr/employee-reminders/:id/actions`: `{action:'read'|'acknowledge'|'resolve'|'cancel',comment?}`.
- `GET /hr/employee-reminders/messages` and `POST /messages/:id/read`: own source-constrained HR inbox, independent of workorder module permissions.
- Migration `000382_hr_employee_date_reminders.sql` adds reminder/action tables, scoped occurrence uniqueness and append-only action history. Enterprise install manifest appends the same migration and `000009_employee_date_reminder_permissions.sql`; never regenerate applied kernel/steps.

## 3. Contracts

- Shanghai business date; inclusive window0..365. Current and next calendar year; hire anniversary requires an earlier hire year. Explicit Feb29 policy: skip/feb_28/mar_1. Original date years and ages never enter reminder or message DTOs.
- Preview counts matched occurrences, active employees lacking dates, and matched occurrences without any eligible selected recipient. Missing dates never become zero/default values.
- Recipients require current enabled identity, membership and exact domain capability. Team recipients additionally require the current direct-manager binding and existing managed organization tree. Permission definitions are tenant-wide, role-permission links target the current scope, and tenant roles can have a different storage home.
- Stable business uniqueness is tenant/park/employee/kind/dueDate/recipient, independent of window. Generate/actions/message-read use real replay interceptors and global write keys. Notification and required audit participate in the same reminder transaction.
- Pending reminders are cancelled when the source date, employment status, selected recipient relation or capability changes. Unrelated profile/employee version changes preserve reminders. Closed records retain history; automatic cancellation records its actual triggering actor.
- Self reads require both own recipient and the employee's current user binding. Previous HR recipient history must not become a self-read bypass after demotion. Team reads use the current managed tree.
- Safe list/detail include employeeName/code; messages expose only id/sourceId/title/content/targetUrl/readAt/createTime. Notification target is exact `/hr/employee-reminders?reminder=<uuid>`, reauthorized at detail.
- Seed page must be visible menu/20 with frontend_route; operations remain buttons. Enterprise canonical routes/labels/catalog are updated together. Existing enterprise migration adds definitions without automatic role grants.
- Web uses all-view `ds-scene-grid` with record cards, shared HR page spacing and secondary buttons. `ds-mobile-record-list` alone is hidden on desktop. Entry UUID is loaded independently of list filters/pagination. Old-key reload callbacks must return before abort/state mutation. Ambiguous retries retain keys, and committed success survives readback failure.

## 4. Validation & Error Matrix

| Input / state | Required result |
|---|---|
| Impossible date, null/blank/boolean window, duplicate recipients, missing leap policy | DTO400 |
| Unknown or unauthorized exact reminder/message |404 |
| Missing run/action capability |403 |
| Illegal terminal transition or cancelled-source action |409 |
| Concurrent generation, changed window, new retry key | No duplicate reminder/message |
| Message or required audit insert fails | Entire reminder/action transaction rolls back |
| Old filter/identity/detail response | Never replaces current rows or selected detail |
| Successful write + failed reread | Keep success receipt; offer read retry |

## 5. Good / Base / Bad Cases

Good: December31 and January1 occur within a cross-year window; narrow custom roles receive and handle only scoped reminders. Base: missing source dates and no eligible selected recipients are diagnostics. Bad: interpreting missing dates, inferring HR roles by code, coercing null to0, showing former HR recipients through self permissions, or treating source-version-only changes as invalidation.

## 6. Tests Required

`hr-employee-reminder.spec.ts` exercises production preview dates and strict DTO/controller gates. `hr-employee-reminder.pg.spec.ts` uses original migration, real message service and random schema for concurrency, rollback, current membership/roles/relations, cross-home identity, HR downgrade, immutable actors/history and own inbox. Root alone runs DB/runtime writes. Web `hr-employee-date-reminders.test.tsx` covers exact entry, read-only filters/page2, stale context, explicit/current preview, stable uncertain retry, write-success/read-failure and delayed notification callbacks. Normal password HTTP in integrated and independent modes plus actual desktop/390px rendering are separate acceptance evidence. Independent install requires fresh, previous-step upgrade and replay checks. New restore acceptance requires a new paired snapshot containing these tables and current install manifest; old restore receipts do not apply.

## 7. Wrong vs Correct

```ts
// Wrong: a previous render's callback aborts the newly selected detail.
controller.current?.abort();
// Correct: guard the key before touching any current request or state.
if (currentKey.current !== key) return true;
controller.current?.abort();
```
