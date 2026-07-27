# Property Business Control Contracts

## 1. Scope / Trigger

Apply these contracts to homestay and housing-rental booking dates, guest identity, financial details, billing periods, purchases, and permission-aware operations pages.

## 2. Signatures

- `GET /homestay/rates/:unitId?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
- `POST /homestay/bookings/:id/guests`
- `GET /housing/leases/:id`
- `POST /housing/leases`
- `POST /housing/purchases`
- `POST /housing/purchases/:id/transfer`

## 3. Contracts

- Business date strings are real `YYYY-MM-DD` calendar dates and use `Asia/Shanghai` when derived from the current instant.
- A homestay guest is verified only when the scoped Party is verified and has both identity document type and protected identity data.
- Housing lease readers without `housing:finance:read` receive no receivable, ledger, or finance-summary data.
- Billing month advancement remains anchored to the original start day; each target month alone may clamp to its last day.
- Purchase line amounts are rounded to cents first; the header total is the sum of persisted rounded lines.
- Purchase recharge requires at least one item and rejects refunded purchases.
- Optional Party contact and identity fields preserve an explicit clearing signal.
- Operations pages load permission-separated data blocks independently so one unauthorized optional request cannot discard authorized data.
- Housing operations page defaults and calendar offsets derive from the Shanghai business date.
- Housing unit, tenant, lease, and purchase datasets retain server pagination; changing a candidate page must also synchronize the selected option.
- Lease detail selection clears stale detail and attachments before loading, and ignores out-of-order responses.
- Housing ledger charge types come from the selected receivable, while deposit entries always use the deposit charge type.
- A logical finance submission holds one in-flight lock and one idempotency key.
- Handover evidence is scoped to one lease and one handover attempt and is cleared after success or context changes.
- File upload is a separate action; its native file input must not impose required validation on a parent business form.
- Move-out handover exposes damage, unsettled charges, and deposit deduction together.
- Lease activation is offered only after the persisted offline signature reference exists.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing or impossible rate-calendar date | HTTP 400 |
| Guest marked verified without verified identity data | HTTP 400 |
| Lease-only reader requests lease detail | Finance arrays empty and finance summary `null` |
| Duplicate lease code in tenant/park | HTTP 409 |
| Purchase transfer has no items | HTTP 400 |
| Purchase was refunded | HTTP 409 on recharge |
| Optional Party field is `null` or blank during update | Clear the persisted value |

## 5. Good / Base / Bad Cases

- Good: `2026-01-31` to `2026-03-31` is exactly two natural billing months.
- Good: three rounded purchase lines reconcile exactly with the purchase header.
- Base: a lease-only operator can inspect lease and handover data without seeing finance data.
- Bad: trusting a request-level `verification_status=verified` without inspecting the Party identity record.
- Bad: using `new Date().toISOString().slice(0, 10)` for a Shanghai operating date.

## 6. Tests Required

- Unit: invalid calendar dates, Shanghai midnight, identity verification prerequisites.
- Unit: end-of-month billing anchors and partial tail periods.
- Unit: purchase line rounding and header reconciliation.
- DTO: non-empty purchase transfer and explicit Party field clearing.
- Integration: duplicate lease code returns 409; refunded purchase cannot recharge.
- Frontend: granular roles retain authorized page data and mobile booking cards expose cancellation.
- Frontend: optional dataset failures do not discard successful loads; stale lease-detail responses cannot retarget forms.
- Frontend: finance charge-type derivation, in-flight submission locking, handover evidence reset, pagination, and signed activation visibility.

## 7. Wrong vs Correct

### Wrong

```ts
const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
const lines = items.map((item) => (item.quantity * item.unitPrice).toFixed(2));
```

### Correct

```ts
const lines = items.map((item) => Math.round(item.quantity * item.unitPrice * 100));
const total = lines.reduce((sum, cents) => sum + cents, 0);
```
