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
- A homestay guest is verified only when the current scoped Party is verified and has both identity document type and protected identity data; check-in must not trust a stale booking-guest snapshot after Party identity changes.
- Housing lease readers without `housing:finance:read` receive no receivable, ledger, or finance-summary data.
- Billing month advancement remains anchored to the original start day; each target month alone may clamp to its last day.
- Purchase line amounts are rounded to cents first; the header total is the sum of persisted rounded lines.
- Purchase recharge requires at least one item and rejects refunded purchases.
- Optional Party contact and identity fields preserve an explicit clearing signal.
- Operations pages load permission-separated data blocks independently so one unauthorized optional request cannot discard authorized data.
- Housing operations page defaults and calendar offsets derive from the Shanghai business date.
- Overlapping operations-page refreshes are sequenced; only the latest response may replace visible datasets, messages, or loading state.
- Housing unit, tenant, lease, and purchase datasets retain server pagination; changing a candidate page must also synchronize the selected option.
- A newly created tenant remains rendered and selected until the server page containing it has loaded.
- Lease detail selection clears stale detail and attachments before loading, and ignores out-of-order responses.
- Housing ledger charge types come from the selected receivable, while deposit entries always use the deposit charge type.
- A logical finance submission holds one in-flight lock and one idempotency key; ambiguous failures retain that key until the payload changes or a response succeeds.
- A logical purchase submission holds one in-flight lock and one idempotency key; ambiguous failures retain that key until the payload changes or a response succeeds.
- Housing bill generation targets one explicit charge plan per request.
- Later purchase-line transfers into the same source receivable add only newly transferred line amounts; idempotent replay does not add them twice.
- Housing checkout requires both tenant receivables and the confirmed deposit balance to be settled.
- Housing repair evidence must use the shared image policy and remain scoped to `workorder_create` plus the current lease.
- Purchase recharge requires the operator to select the exact untransferred line items; loading a purchase must not select every line automatically.
- Purchase recharge resets when the selected lease changes, targets only active/expiring/checkout leases, and reuses receivables only when their source IDs also match.
- New Party records remain unverified; general updates cannot change verification status, and a dedicated transition verifies only records with protected identity data.
- Failed optional unit or tenant loads preserve existing visible selections; successful loads alone synchronize form candidates.
- Paginated KPIs use server totals rather than the current page length.
- Permission-specific KPIs and workflow blocks are not rendered for users who cannot load their source datasets.
- Handover evidence is scoped to one lease and one handover attempt and is cleared after success or context changes.
- Move-in handovers reject non-zero move-out-only damage, unsettled, and deduction values.
- A completed handover is returned before validating replay payload evidence or financial balances, so retries cannot repeat or invalidate completed financial effects.
- File upload is a separate action; its native file input must not impose required validation on a parent business form.
- Pending workflow uploads keep their file metadata for preview/removal, and a completed upload is discarded when its lease context is no longer current.
- Move-out handover exposes damage, unsettled charges, and deposit deduction together.
- Lease activation is offered only after the persisted offline signature reference exists.
- Lease detail renders the occupants and finance ledger returned by the API, while finance data remains absent without finance-read permission.
- Desktop tables and mobile record cards switch at the same breakpoint, and mobile labels retain server IDs when paginated names are unavailable.
- Purchase operations expose every supported transition that is valid for the current approval/payment state, including reject, refund, and void.
- Dashboard business dates receive the same strict calendar validation as rate-calendar dates.
- Guest registration is closed after a booking is cancelled, marked no-show, or checked out.
- Identity document type is validated whenever supplied, even without an identity number; changing protected identity fields resets an already verified Party to `unverified`.
- Homestay cancellation reverses only room-related waivers and never subtracts unrelated manual waivers from room revenue.
- Homestay dashboard occupancy is calculated for the requested business date, not from the current booking status alone.
- Homestay booking lists use server pagination; clients must not silently truncate the operational dataset to a fixed first page.
- Booking-detail and post-action refreshes retain the originating booking ID and discard late responses after the operator changes selection.
- Purchase amount calculation uses decimal strings or scaled integers across the full `numeric(18,2)` range; JavaScript `number` is not an acceptable persisted total.
- The first generated rent receivable uses `first_due_date`; later periods derive their due date from the configured billing day.
- Energy-meter charge plans and bill generation accept only meters whose enable flag and operational status are both active, in the same tenant, park, and housing unit as the lease.
- Energy-meter usage and charge amounts both apply the meter multiplier to the raw reading difference.
- Duplicate housing purchase codes are translated from database unique violations to HTTP 409.
- Dashboard finance and purchase aggregates are queried and returned only when the actor has the corresponding granular read permission.
- Activating a previously held occupancy revalidates current unit scope, operating mode, and operating status inside the activation transaction.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing or impossible property-business calendar date | HTTP 400 |
| Guest marked verified without verified identity data | HTTP 400 |
| Lease-only reader requests lease detail | Finance arrays empty and finance summary `null` |
| Duplicate lease code in tenant/park | HTTP 409 |
| Purchase transfer has no items | HTTP 400 |
| Purchase was refunded | HTTP 409 on recharge |
| Optional Party field is `null` or blank during update | Clear the persisted value |
| Party identity type or protected identity changes after verification | Persist `verification_status=unverified` |
| Occupancy `source_type` or `source_id` is blank after trimming | HTTP 400 |
| Energy meter is disabled, cross-scope, or attached to another unit | HTTP 404/409/400 without creating the plan |
| Meter multiplier is not positive or closing reading precedes opening reading | HTTP 400 without creating a receivable |
| Move-in handover contains move-out financial amounts | HTTP 400 |
| Purchase code collides in the current tenant and park | HTTP 409 |
| Dashboard reader lacks finance or purchase permission | Omit the corresponding aggregate and do not query it |
| Held occupancy becomes mode-incompatible or disabled before activation | HTTP 409 |

## 5. Good / Base / Bad Cases

- Good: `2026-01-31` to `2026-03-31` is exactly two natural billing months.
- Good: three rounded purchase lines reconcile exactly with the purchase header.
- Good: a January 31 lease keeps the January 31 anchor when a later bill covers February 28 through March 31.
- Good: a retried homestay ledger submission reuses one idempotency key until that logical payload succeeds.
- Base: a lease-only operator can inspect lease and handover data without seeing finance data.
- Bad: trusting a request-level `verification_status=verified` without inspecting the Party identity record.
- Bad: using `new Date().toISOString().slice(0, 10)` for a Shanghai operating date.
- Bad: clearing attachments or replacing booking detail after an asynchronous request if the operator has switched to another lease or booking.

## 6. Tests Required

- Unit: invalid calendar dates, Shanghai midnight, identity verification prerequisites.
- Unit: end-of-month billing anchors and partial tail periods.
- Unit: decimal-safe purchase line rounding and header reconciliation, including half-cent boundaries.
- Unit: purchase totals near the `numeric(18,2)` boundary remain exact decimal strings.
- Unit: cancellation ignores non-room waivers and dashboard occupancy follows the requested date.
- Unit/DTO: impossible calendar dates, whitespace-only occupancy source identifiers, and identity-change verification reset.
- DTO: non-empty purchase transfer and explicit Party field clearing.
- Integration: duplicate lease/purchase codes return 409; refunded purchase cannot recharge.
- Integration: held occupancy activation rechecks the latest mode/status and energy-meter plans enforce scope, enable flag, operational status, unit binding, and multiplier.
- Integration: completed handover replay returns the original result before balance/evidence revalidation; move-in rejects move-out-only amounts.
- Integration: check-in re-reads current Party verification and identity data instead of trusting the guest-row snapshot.
- Integration: first rent uses `first_due_date`; split later periods retain the original lease start-day anchor.
- Frontend: granular roles retain authorized page data and mobile booking cards expose cancellation.
- Frontend: optional dataset failures do not discard successful loads; stale lease-detail responses cannot retarget forms.
- Frontend: finance charge-type derivation, retry-key retention, in-flight submission locking, handover evidence reset, upload context races, pagination, and signed activation visibility.
- Frontend: explicit charge-plan billing, explicit purchase-line recharge selection, occupant/ledger detail rendering, permission-aware KPIs, and aligned desktop/mobile breakpoints.
- DTO/frontend: supported identity-document formats reject arbitrary identifiers and newly created parties remain unverified.

## 7. Wrong vs Correct

### Wrong

```ts
const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
const lines = items.map((item) => (item.quantity * item.unitPrice).toFixed(2));
await prepareBooking(selectedBookingId); // selectedBookingId may now identify another order
```

### Correct

```ts
const quantityThousandths = parseScaledDecimal(item.quantity, 3);
const unitPriceCents = parseScaledDecimal(item.unitPrice, 2);
const lineCents = (quantityThousandths * unitPriceCents + 500n) / 1_000n;

const originatingBookingId = selectedBookingId;
const succeeded = await submit(originatingBookingId);
if (succeeded && selectedBookingIdRef.current === originatingBookingId) {
  await prepareBooking(originatingBookingId);
}
```
