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
- Housing finance-only readers receive finance data without tenant profile, occupant, handover, or repair projections unless they also have `housing:lease:read`.
- Lease rent and deposit values remain decimal strings from HTTP input through persistence; JavaScript `number` is not an acceptable lease-money boundary.
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
- Housing repair evidence uses the protected `housing_repair` business type, shared image policy, current lease reference, housing permission, and unit data scope; generic work-order or file permissions are insufficient.
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
- Lease activation is offered only after the persisted offline signature reference exists, and activation revalidates the current, non-deleted PDF business attachment inside the transaction.
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
- Energy-meter charge plans and bill generation accept only enabled meters whose operational status is exactly `ONLINE`, in the same tenant, park, and housing unit as the lease.
- Energy-meter usage and charge amounts both apply the meter multiplier to the raw reading difference.
- Duplicate housing purchase codes are translated from database unique violations to HTTP 409.
- Dashboard finance and purchase aggregates are queried and returned only when the actor has the corresponding granular read permission.
- Activating a previously held occupancy revalidates current unit scope, operating mode, and operating status inside the activation transaction.
- Payments and refunds posted to the deposit receivable are normalized to `deposit_receipt` and `deposit_refund`; deposit balances must never depend on a caller choosing a special ledger type.
- Active receivables for one charge plan use non-overlapping `[period_start, period_end)` periods, enforced by both the lease-locked service transaction and a database exclusion constraint.
- One active charge plan exists per tenant, park, lease, and charge type; upsert locks the lease and the database owns the final unique constraint.
- A new bill-generation request whose period is identical to an existing receivable returns HTTP 409; only a replay with the same idempotency key may return the cached original response.
- Final housing leases (`terminated` or `void`) accept no new occupants or ledger entries.
- Deposit deductions are created only by the completed move-out handover workflow; the generic ledger endpoint rejects caller-supplied deductions.
- A purchase with any transferred line cannot be voided until the transfer is explicitly reversed by a supported audited workflow.
- Purchase quantities, unit prices, persisted line amounts, and recharge totals remain decimal strings or scaled integers from HTTP input through persistence.
- Changing `identity_document_type` without a replacement identity number clears the old encrypted, hashed, and masked identity values.
- A checked-out homestay booking stops contributing to occupied units and average daily rate on and after its actual Shanghai checkout date; departures use the actual checkout date.
- Fixed housing rent and partial-period proration use integer cents and an exact rational month fraction; persisted rent must never pass through JavaScript `number` during billing.
- Homestay guest registration locks the booking row inside the same transaction that validates status and saves the guest.
- Project-wide housing purchase attachments require unrestricted park property scope when the referenced purchase has no unit.
- Housing charge-plan DTOs require `amount` for fixed plans and both `meter_id` and
  exact decimal-string `unit_price` for energy-meter plans; irrelevant source fields
  are cleared instead of carried into persistence.
- Housing settlements, deposit balances, checkout balances, and finance summaries use
  decimal strings and scaled integer cents throughout; accepting an exact HTTP string
  and later converting persisted values to `number` is prohibited.
- Cancelling a homestay booking atomically voids every issued credential before its
  occupancy is released. Credential issuance locks the same booking row as cancellation.
- A housing purchase with transferred lines cannot be refunded or voided until an
  explicit audited reversal workflow clears those transfers.
- A protected file already referenced by a lease signature, completed handover,
  housing repair work order, purchase, or turnover task cannot be deleted through the
  generic file endpoint.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing or impossible property-business calendar date | HTTP 400 |
| Guest marked verified without verified identity data | HTTP 400 |
| Lease-only reader requests lease detail | Finance arrays empty and finance summary `null` |
| Finance-only reader requests lease detail | Finance data present; tenant, occupants, handovers, and repairs absent |
| Duplicate lease code in tenant/park | HTTP 409 |
| Purchase transfer has no items | HTTP 400 |
| Purchase was refunded | HTTP 409 on recharge |
| Optional Party field is `null` or blank during update | Clear the persisted value |
| Party identity type or protected identity changes after verification | Persist `verification_status=unverified` |
| Occupancy `source_type` or `source_id` is blank after trimming | HTTP 400 |
| Energy meter is disabled, not `ONLINE`, cross-scope, or attached to another unit | HTTP 404/409/400 without creating the plan |
| Meter multiplier is not positive or closing reading precedes opening reading | HTTP 400 without creating a receivable |
| Move-in handover contains move-out financial amounts | HTTP 400 |
| Purchase code collides in the current tenant and park | HTTP 409 |
| Dashboard reader lacks finance or purchase permission | Omit the corresponding aggregate and do not query it |
| Held occupancy becomes mode-incompatible or disabled before activation | HTTP 409 |
| Charge-plan period overlaps a non-void receivable | HTTP 409 |
| New idempotency key requests an identical existing billing period | HTTP 409 |
| Concurrent active charge-plan creation for the same lease/type | One result; database conflict translated to HTTP 409 |
| Ordinary payment/refund targets the deposit receivable | Persist as deposit receipt/refund and update both receivable and deposit balance |
| Identity document type changes without a new identity number | Clear protected identity and reset verification |
| Signature attachment is deleted after signing but before activation | HTTP 404 without activating occupancy |
| Occupant or ledger write targets a final lease | HTTP 409 |
| Generic ledger request supplies `deposit_deduction` | HTTP 400 |
| Purchase with transferred lines is voided | HTTP 409 |
| Fixed rent exceeds JavaScript safe-cent range | Preserve the exact decimal amount through bill creation |
| Guest registration races a terminal booking transition | Booking lock serializes both actions; terminal status rejects registration |
| Generic file reader requests `housing_repair` evidence without housing access | HTTP 403 |
| Restricted unit-scope actor requests a project-wide purchase attachment | HTTP 403 |
| Fixed charge plan omits amount | HTTP 400 |
| Energy-meter plan omits meter or unit price | HTTP 400 |
| Settlement uses a JSON number instead of an exact decimal string | HTTP 400 |
| Booking cancellation finds issued credentials | Atomically void credentials, then release occupancy |
| Purchase with transferred lines is refunded | HTTP 409 |
| Generic deletion targets referenced protected evidence | HTTP 409 |

## 5. Good / Base / Bad Cases

- Good: `2026-01-31` to `2026-03-31` is exactly two natural billing months.
- Good: three rounded purchase lines reconcile exactly with the purchase header.
- Good: a January 31 lease keeps the January 31 anchor when a later bill covers February 28 through March 31.
- Good: a retried homestay ledger submission reuses one idempotency key until that logical payload succeeds.
- Good: `99999999999999.99` monthly rent remains exactly `99999999999999.99` for one full billing month.
- Base: a lease-only operator can inspect lease and handover data without seeing finance data.
- Bad: trusting a request-level `verification_status=verified` without inspecting the Party identity record.
- Bad: using `new Date().toISOString().slice(0, 10)` for a Shanghai operating date.
- Bad: clearing attachments or replacing booking detail after an asynchronous request if the operator has switched to another lease or booking.

## 6. Tests Required

- Unit: invalid calendar dates, Shanghai midnight, identity verification prerequisites.
- Unit: end-of-month billing anchors and partial tail periods.
- Unit: decimal-safe purchase line rounding and header reconciliation, including half-cent boundaries.
- Unit: purchase totals near the `numeric(18,2)` boundary remain exact decimal strings.
- Unit/DTO: lease rent and deposit near the `numeric(18,2)` boundary remain exact decimal strings and numeric JSON inputs are rejected.
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
- Integration: overlapping or identical housing billing periods under a new request fail; same-key replay is owned by the idempotency interceptor; concurrent charge-plan upserts cannot create duplicates.
- Integration: final leases reject occupant and ledger writes; manual deposit deduction and voiding a transferred purchase fail.
- Integration: lease activation revalidates its signature attachment, and finance-only detail reads do not expose tenant profile data.
- Unit/integration: fixed rent proration uses exact fractions and preserves cents above JavaScript's safe integer range.
- Integration: guest registration locks the booking against cancellation, no-show, and checkout.
- Integration: housing repair and project-wide purchase attachments enforce their business permission and property data scope.
- DTO/unit: charge-plan source fields are conditionally required and settlement values
  preserve the final cent near the `numeric(18,2)` boundary.
- Integration: cancellation and concurrent credential issuance serialize on the booking
  row, leaving no issued credential after a successful cancellation.
- Integration: transferred purchases reject both refund and void actions.
- Integration: referenced protected evidence rejects generic deletion while unbound
  pending uploads remain removable.
- E2E: an ordinary payment against a deposit receivable produces a deposit receipt and the checkout balance remains consistent.
- Unit: cached idempotent responses preserve `Date` values as ISO strings.

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
const rentCents = multiplyHousingMoneyByRatio(plan.amount, monthNumerator, monthDenominator);

const originatingBookingId = selectedBookingId;
const succeeded = await submit(originatingBookingId);
if (succeeded && selectedBookingIdRef.current === originatingBookingId) {
  await prepareBooking(originatingBookingId);
}
```
