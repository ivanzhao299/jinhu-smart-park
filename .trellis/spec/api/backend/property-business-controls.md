# Property Business Control Contracts

## 1. Scope / Trigger

Apply these contracts to homestay and housing-rental booking dates, guest identity, financial details, billing periods, purchases, and permission-aware operations pages.

## 2. Signatures

- `GET /homestay/rates/:unitId?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
- `GET /homestay/unit-candidates?page=1&page_size=20`
- `GET /homestay/turnovers?status=open&page=1&page_size=20`
- `POST /homestay/bookings/:id/guests`
- `GET /housing/leases/:id`
- `POST /housing/leases`
- `PUT /housing/leases/:id/charge-plans`
- `POST /housing/leases/:id/handovers`
- `POST /housing/purchases`
- `POST /housing/purchases/:id/transfer`

## 3. Contracts

- Business date strings are real `YYYY-MM-DD` calendar dates and use `Asia/Shanghai` when derived from the current instant.
- A homestay guest is verified only when the current scoped Party is verified and has both identity document type and protected identity data; check-in must not trust a stale booking-guest snapshot after Party identity changes.
- Housing lease readers without any housing finance permission receive no receivable,
  ledger, or finance-summary data. Actors with finance-read, finance-register, or
  finance-waive receive the minimum finance projection needed to perform their
  authorized action.
- Housing finance-only readers receive finance data without tenant profile, occupant,
  handover, or repair projections. Handover managers may read completed handover
  snapshots without `housing:lease:read`; attachment metadata still requires
  `file:read`.
- Lease rent and deposit values remain decimal strings from HTTP input through persistence; JavaScript `number` is not an acceptable lease-money boundary.
- Billing month advancement remains anchored to the original start day; each target month alone may clamp to its last day.
- Purchase line amounts are rounded to cents first; the header total is the sum of persisted rounded lines.
- Purchase recharge requires at least one item and rejects refunded purchases.
- Optional Party contact and identity fields preserve an explicit clearing signal.
- Operations pages load permission-separated data blocks independently so one unauthorized optional request cannot discard authorized data.
- Housing operations page defaults and calendar offsets derive from the Shanghai business date.
- Housing lease creation requires `housing:lease:create`, `housing:tenant:manage`,
  and `unit:read` together because the write depends on both selector datasets.
- Housing lease `end_date` is strictly later than `start_date`; the Web date input
  uses `min=addBusinessDateDays(start_date, 1)` and adjusts a now-invalid end date
  when the start changes.
- Overlapping operations-page refreshes are sequenced; only the latest response may replace visible datasets, messages, or loading state.
- Housing unit, tenant, lease, and purchase datasets retain server pagination; changing a candidate page must also synchronize the selected option.
- Lease creation and purchase cost collection own independent unit candidate arrays,
  pagination state, and selection synchronization even though both call `/park-units`.
- Housing purchase creation requires purchase-manage and unit-read together because
  the form depends on the scoped unit selector. Bound receipt metadata remains on the
  purchase list for authorized purchase/file readers after creation.
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
- Party identity updates validate the effective merged identity pair: when a partial
  update supplies only `identity_number`, the service uses the persisted document
  type rather than requiring the client to resend it.
- ID-card identity numbers use one canonical representation before encryption,
  hashing, masking, and uniqueness checks; a terminal `x` is normalized to `X`.
  Duplicate detection also recognizes legacy lowercase-check-digit hashes.
- Party identity updates and verification transitions acquire the same Party-row
  write lock. Homestay guest registration and check-in hold a compatible Party-row
  read lock until their transaction commits, so lifecycle decisions cannot retain a
  stale verified identity.
- Party role types must remain non-empty after request normalization.
- Party-role creation treats its database unique constraint as the concurrency
  authority: after a unique violation, reload and return the concurrently committed
  normalized role; unrelated persistence errors must still propagate.
- Failed optional unit or tenant loads preserve existing visible selections; successful loads alone synchronize form candidates.
- Paginated KPIs use server totals rather than the current page length.
- Permission-specific KPIs and workflow blocks are not rendered for users who cannot load their source datasets.
- Handover evidence is scoped to one lease and one handover type. New uploads use
  protected `housing_handover_move_in` or `housing_handover_move_out` business types;
  the legacy `housing_handover` type remains readable only for UAT compatibility.
- `GET /housing/leases/:id` returns `pending_handover_files.move_in`,
  `pending_handover_files.move_out`, and each completed handover's `photo_files`.
  Pending projections exclude every file ID already referenced by a handover.
- Completed handover snapshots are readable with either `housing:lease:read` or
  `housing:handover:manage`; attachment metadata remains independently gated by
  `file:read`.
- Handover creation locks its submitted file rows and rejects a file already bound
  to the sibling handover type. Upload-in-flight state blocks type switching,
  evidence removal, and submission.
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
- Every homestay booking list item carries its own nullable `unitCode` and `unitName`;
  booking labels must not depend on the separately paginated active-unit candidate list.
- Booking-detail and post-action refreshes retain the originating booking ID and discard late responses after the operator changes selection.
- Purchase amount calculation uses decimal strings or scaled integers across the full `numeric(18,2)` range; JavaScript `number` is not an acceptable persisted total.
- The first generated rent receivable uses `first_due_date`; later periods derive their due date from the configured billing day.
- Energy-meter charge plans and bill generation accept only enabled meters whose operational status is exactly `ONLINE`, in the same tenant, park, and housing unit as the lease.
- Energy-meter usage and charge amounts both apply the meter multiplier to the raw reading difference.
- Meter readings, multipliers, unit prices, usage, and charges remain decimal strings
  or scaled integers throughout calculation; large readings with small increments
  must not collapse through JavaScript floating-point conversion.
- Duplicate housing purchase codes are translated from database unique violations to HTTP 409.
- Dashboard finance and purchase aggregates are queried and returned only when the actor has the corresponding granular read permission.
- Activating a previously held occupancy revalidates current unit scope, operating mode, and operating status inside the activation transaction.
- Payments and refunds posted to the deposit receivable are normalized to `deposit_receipt` and `deposit_refund`; deposit balances must never depend on a caller choosing a special ledger type.
- Active receivables for one charge plan use non-overlapping `[period_start, period_end)` periods, enforced by both the lease-locked service transaction and a database exclusion constraint.
- One active charge plan exists per tenant, park, lease, and charge type; upsert locks the lease and the database owns the final unique constraint.
- A new bill-generation request whose period is identical to an existing receivable returns HTTP 409; only a replay with the same idempotency key may return the cached original response.
- Final housing leases (`terminated` or `void`) accept no new occupants, ledger
  entries, or charge-plan changes.
- Tenant creation, lease creation, handover completion, purchase creation, finance,
  and repair submission each hold a synchronous lock plus one stable idempotency key
  for the unchanged payload until success.
- Deposit deductions are created only by the completed move-out handover workflow; the generic ledger endpoint rejects caller-supplied deductions.
- A purchase with any transferred line cannot be voided until the transfer is explicitly reversed by a supported audited workflow.
- Purchase quantities, unit prices, persisted line amounts, and recharge totals remain decimal strings or scaled integers from HTTP input through persistence.
- Changing `identity_document_type` without a replacement identity number clears the old encrypted, hashed, and masked identity values.
- A checked-out homestay booking stops contributing to occupied units and average daily rate on and after its actual Shanghai checkout date; departures use the actual checkout date.
- Fixed housing rent and partial-period proration use integer cents and an exact rational month fraction; persisted rent must never pass through JavaScript `number` during billing.
- Homestay guest registration locks the booking row inside the same transaction that validates status and saves the guest.
- Under that booking lock, guest registration derives primary-guest status from the
  persisted active roster; concurrent callers cannot both create a primary guest.
- Project-wide housing purchase attachments require unrestricted park property scope when the referenced purchase has no unit.
- Housing charge-plan DTOs require `amount` for fixed plans and both `meter_id` and
  exact decimal-string `unit_price` for energy-meter plans; irrelevant source fields
  are cleared instead of carried into persistence.
- Housing settlements, deposit balances, checkout balances, and finance summaries use
  decimal strings and scaled integer cents throughout; accepting an exact HTTP string
  and later converting persisted values to `number` is prohibited.
- Cancelling a homestay booking atomically voids every issued credential before its
  occupancy is released. Credential issuance locks the same booking row as cancellation.
- Marking a homestay booking as no-show follows the same credential rule as cancellation:
  atomically void issued credentials before releasing occupancy.
- Homestay rates, room totals, ledger amounts, summaries, refund limits, waivers, and
  cancellation adjustments remain decimal strings or scaled integer cents across HTTP,
  service calculations, persistence, and frontend submissions.
- Every aggregate homestay amount is checked against the target `numeric(18,2)` range
  after exact scaled-integer calculation and before any booking or nightly snapshot is saved.
- A housing purchase with transferred lines cannot be refunded or voided until an
  explicit audited reversal workflow clears those transfers.
- A protected file already referenced by a lease signature, completed handover,
  housing repair work order, purchase, or turnover task cannot be deleted through the
  generic file endpoint.
- Initial occupancy conflict checks include active commercial contracts when no source
  exclusion is supplied; SQL exclusion predicates must be null-safe.
- Meter usage may be rounded for persistence, but charge calculation must use the
  full-precision reading difference and multiplier and round only the final cents.
- Refunded purchases are excluded from purchase-cost KPIs even when their approval
  status remains approved.
- External-order uniqueness normalizes nullable channel names (or requires a channel);
  a nullable column must not silently weaken the business unique key.
- An open homestay turnover task blocks shared availability and operating-mode
  transition even when its original booking occupancy has already been released.
- Creating an occupancy that represents an already-persisted operational task must
  exclude that exact `source_type` + `source_id` from conflict discovery; sibling
  open tasks remain blockers.
- Initial homestay rate configuration uses one PostgreSQL `INSERT ... ON CONFLICT`
  statement against the active unit-scoped unique key; read-then-insert is forbidden.
- `GET /homestay/rates/:unitId` returns every field editable by the rate form,
  including `checkout_requires_inspection`.
- Homestay unit candidates retain server pagination, and page changes replace stale
  selections with a unit visible on the loaded page.
- Homestay rate and booking selectors use the authoritative unit-candidate endpoint,
  which returns only active, enabled `short_stay` units inside the actor's property
  scope. A generic park-unit list is not an operational candidate source.
- Homestay turnover lists are server-paginated. The operations surface requests the
  `open` subset (`pending`, `cleaning`, `inspection`, and `exception`) rather than
  loading unbounded completed history.
- Each turnover list item carries its own nullable `unitCode` and `unitName` display
  fields resolved from the scoped unit row. Queue labels must not depend on the
  unrelated, paginated rate/booking candidate page.
- A confirmed homestay booking may be marked `no_show` only on or after its
  `arrival_date` begins in `Asia/Shanghai`. Button visibility is UX only; the
  service enforces the same temporal boundary under the booking lock.
- Returning an issued stay credential is replay-safe: the credential row is locked,
  an already-returned credential keeps its original `returned_at`, and lost/void
  credentials cannot be changed to returned.
- Every permission group that consumes paginated homestay unit candidates has a
  reachable pager beside its own selector. Rate-read permission must not be required
  to navigate booking-create candidates.
- Turnover-read users may inspect exception details. Attachment loading additionally
  requires `file:read`; without it, the attachment component is not mounted. Work-order
  linking and execution controls require `homestay:turnover:execute`; evidence upload
  additionally requires `file:upload`, so the upload control requires both permissions.
- The `workorder_handler` range used by the homestay task queue is also enforced by
  turnover detail and every turnover mutation: unassigned turnover remains a public
  claimable queue item, while a self/custom actor cannot read, execute, or reassign a
  turnover already assigned outside its allowed handler IDs. A submitted
  `linked_work_order_id` is re-read under the mutation transaction lock and must satisfy
  `workorder:read`, tenant/park/unit scope, active non-terminal status, and all work-order
  data scopes; candidate-list visibility alone is never authorization for a later write.
- Housing handover fields render only for `housing:handover:manage`; its uploader also
  requires `file:upload`. Apply the same domain-write plus generic-file intersection
  to housing repair, lease-signature, and purchase upload surfaces.
- After an action removes the final item from an open-turnover page, the client clamps
  the requested page to the new last page and reloads it.
- An `exception` turnover card renders the persisted `exception_description`
  prominently before any completion action.
- Turnover completion resolves evidence from the active `homestay_turnover` file
  associations stored by the backend. Client-supplied file IDs may narrow validation,
  but an empty list after refresh must not discard already associated evidence.
- Every housing mutation form is mounted only when its exact domain-write permission
  is present; button-level permission checks do not make an otherwise visible form
  an acceptable read-only projection.
- Lease-list responses own `unitCode`, `unitName`, and `tenantDisplayName`; display
  labels must not depend on unrelated paginated candidate datasets.
- A selected lease is cleared with all action/evidence context when the refreshed
  lease page no longer contains it. Reloading a lease recovers active signature,
  handover, and repair uploads from the authoritative file service.
- Lease creation uses one synchronous in-flight lock and one stable idempotency key
  per unchanged payload. An ambiguous failure retains the key.
- Dated homestay rate overrides use one PostgreSQL `INSERT ... ON CONFLICT` statement
  against the active unit/date unique key; read-then-insert is forbidden.
- Homestay arrival KPIs retain bookings that arrived on the business date after those
  bookings check out. Rentable capacity counts only active, non-deleted unit rows.
- Homestay availability may retain inactive units for operational visibility, but it
  classifies them as `out_of_service`; they are never reported as rentable.
- Booking detail context is separate from stay-operation context. A readable selected
  booking remains inspectable after terminal transition or refresh while it remains on
  the current page. Terminal states hide stay mutations, not the detail itself.
- `homestay:booking:read` is the context prerequisite for every booking-bound
  confirm, cancel, reschedule, stay, and finance write. The API enforces it together
  with the action permission. Built-in roles that receive an action permission also
  receive booking-read; custom roles must grant the documented composite.
- After booking context is authorized, stay-manage, finance-read, finance-register,
  and finance-waive remain independently projected at sub-control level. An auditor
  may inspect the authorized detail and ledger summary without stay controls; an
  authorized finance operator may register a supported ledger entry on a terminal
  booking when the backend permits it.
- Default booking pagination ranks `checked_in`, `confirmed`, and `draft` ahead of
  terminal history so the first operations page cannot be consumed by old records.
- Booking mutations that may change ledger entries refresh both the list and the
  selected booking detail before the operator continues.
- Selected booking detail owns an independent booking snapshot. A list refresh may
  replace that snapshot when the booking remains visible, but must not clear it merely
  because a terminal transition reorders the booking off the current page. Explicit
  operator pagination clears the selection; a post-action detail reload may retain it.
- Refresh failures have dedicated state. A later all-successful refresh clears the
  failure without erasing an unrelated action-success message.
- Booking-detail failures have dedicated state separate from action and refresh
  feedback. Starting or completing a later successful detail selection clears the
  stale detail error.
- Reloading the same booking preserves its last successful guest, credential, and
  ledger projections until a replacement response succeeds. Selecting another
  booking clears those projections immediately.
- A logical housing-repair submission holds a synchronous in-flight lock and one
  stable idempotency key per unchanged lease/payload. While it is in flight, text,
  select, upload, and attachment-removal controls are immutable.
- `GET /housing/leases/:id` returns `pending_repair_files` when the actor has lease
  read, repair-manage, and file-read permissions. One server-side SQL snapshot selects
  active `housing_repair` files for the lease with `NOT EXISTS` against every active
  work-order `image_file_ids`; the browser must not join `/files` and repair rows from
  independently timed requests.
- Repair creation locks and validates every submitted file, then rejects HTTP 409 if
  any active work order already references it. Referenced files remain historical
  evidence and cannot enter a later repair even when the browser held a stale draft.
- New tenant creation never infers personal-data consent from operator data entry;
  without an explicit consent interaction, the backend default remains `pending`.
- Dated homestay overrides require a strictly positive daily rate in both the DTO and
  frontend control.
- Cancellation and no-show require a visible confirmation step and a trimmed
  operator-entered reason of at most 500 characters before the request is sent. The
  confirmation identifies the immutable target snapshot by booking code, unit label,
  arrival date, and departure date.
- Turnover exception actions require the operator's task-specific description of at
  most 1000 characters. Cleaning/exception completion sends the visible consumables
  list with name, positive quantity of at most three decimals, and optional unit.
- Turnover exception, consumable, and linked-work-order drafts track task-specific
  dirty state. Refresh replaces clean fields from the authoritative response, retains
  active local edits, and clears dirty state only after the matching write succeeds.
- Homestay rate readiness is the exact loaded unit ID, not a page-wide boolean.
  Changing the selector synchronously invalidates the loaded target and disables
  submission until the new unit response arrives. Rate-read-only actors may change
  the selector but every mutable pricing control remains disabled.
- Booking creation, confirmation, rescheduling, and check-in require the current unit
  row to remain active and enabled for short stay. Check-in additionally requires the
  booking's exact occupancy ID/source/unit/date tuple to remain `active`; a force-released
  or replaced occupancy cannot authorize entry.
- Every housing lease workflow permission that requires an existing lease target must
  be able to reach the scoped lease list and detail endpoints. Detail projections
  remain independently permission-gated; reachability must not expose unrelated data.
- Housing lease detail owns each occupant's nullable `partyDisplayName`; persisted
  labels must not depend on the browser's current tenant-candidate page.
- A persisted lease signature is authoritative and read-only. The uploader exists only
  for an unsigned `pending_signature` lease; registration replaces it with evidence.
- Housing purchase list items expose `transferredItemCount`. A positive count blocks
  refund and void controls until a supported audited reversal clears the transfer.
- Every retryable housing transition keeps one idempotency key per unchanged payload
  across ambiguous failures and clears it only after success. This includes secondary
  purchase, lease, billing, charge-plan, occupant, and transfer actions.
- A successful purchase transfer clears its selected purchase and line-item draft.
  Dataset-specific detail errors clear on the next successful load.
- Required browser fields and bounds mirror required DTO/service contracts, including
  payment cycle, rent, deposit, billing day, first due date, and strict date order.

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
| Identity-only update matches the persisted document type | Validate the merged pair and persist the canonical value |
| ID-card number differs only by terminal `x` / `X` | Treat as the same scoped identity; duplicate returns HTTP 409 |
| Identity update races verification or a homestay identity-dependent action | Party-row locks serialize the decisions |
| Party role type is blank after trimming | HTTP 400 |
| Occupancy `source_type` or `source_id` is blank after trimming | HTTP 400 |
| Energy meter is disabled, not `ONLINE`, cross-scope, or attached to another unit | HTTP 404/409/400 without creating the plan |
| Meter multiplier is not positive or closing reading precedes opening reading | HTTP 400 without creating a receivable |
| Move-in handover contains move-out financial amounts | HTTP 400 |
| Handover file belongs to the other handover type | HTTP 400 |
| Handover file is already bound to another handover | HTTP 409 |
| Completed handover evidence is loaded again | Return it under `handovers[].photo_files`, never under `pending_handover_files` |
| Lease creator lacks tenant-manage or unit-read | API rejects creation; Web does not mount an unusable selector form |
| Lease end date equals its start date | Native Web validation blocks it; API returns HTTP 400 if called directly |
| Charge-plan write targets a terminated or void lease | HTTP 409 |
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
| Booking no-show finds issued credentials | Atomically void credentials, then release occupancy |
| Commercial conflict query has no exclusion source | Commercial contracts remain visible to the conflict check |
| Meter reading differs by `0.000001` near the numeric limit | Preserve usage and charge exactly without floating-point collapse |
| Homestay ledger amount exceeds JavaScript safe-cent range | Preserve exact cents through validation, limits, summary, and persistence |
| Purchase with transferred lines is refunded | HTTP 409 |
| Generic deletion targets referenced protected evidence | HTTP 409 |
| Channel-less active bookings reuse one external order number | Database unique violation |
| Refunded purchase remains approved | Exclude it from purchase-cost KPI |
| Open turnover task exists without an occupancy | Unit remains unavailable and cannot switch mode |
| Turnover occupancy is created for its own pending task | Exclude only that task; create the occupancy |
| Two operators create the first unit rate concurrently | Both requests complete through atomic upsert |
| Selected unit rate cannot be loaded | Keep rate submission disabled; do not submit stale form values |
| Generic park unit is not enabled for short stay | Exclude it from homestay unit candidates |
| Turnover query requests `status=open` | Return only open workflow states with bounded pagination metadata |
| Turnover completion follows a refresh and sends no file IDs | Recover active task-associated evidence before validating completion |
| Housing lease page changes while a detail is selected | Clear detail and every pending action/evidence reference |
| Housing operator lacks a mutation permission | Do not mount that mutation form or its candidate controls |
| Lease creation is double-clicked or retried after an ambiguous failure | One in-flight request; unchanged payload reuses the original key |
| Two operators write the same dated rate override | Atomic upsert; one active row for the unit/date |
| Same-day arrival later checks out | Arrival KPI remains counted; occupied KPI follows checkout time |
| Enabled short-stay config points to deleted/inactive unit | Exclude it from rentable capacity and classify inactive availability as `out_of_service` |
| Booking refresh returns a terminal status | Retain readable detail; hide stay-operation controls |
| Booking reader lacks stay-manage but has finance-read | Show detail and ledger summary; hide guest, credential, check-in, and checkout mutations |
| Terminal booking reader also has finance-register | Keep the permitted finance entry form available |
| Actor has stay or finance action permission without booking-read | HTTP 403 and no booking-bound UI context |
| More than one page of historical bookings exists | First page ranks current operational statuses before terminal history |
| Successful refresh follows a partial-load failure | Clear the stale refresh failure; preserve unrelated action feedback |
| Selected booking is confirmed or cancelled | Reload list and selected detail; never retain the previous ledger summary |
| Terminal transition reorders selected booking off page 1 | Preserve its independent detail target and reload the terminal detail |
| One booking detail fails, then another succeeds | Clear the old detail error and show the new detail without a failure banner |
| Operator clicks cancel or no-show | Show confirmation; require the actual reason before sending |
| Confirmation list contains similar bookings | Show booking code, unit, and stay dates for the exact target snapshot |
| Turnover exception description is blank | Do not send; backend returns HTTP 400 if bypassed |
| Turnover consumable has blank name, non-positive/over-precision quantity, or overlong unit | Do not send; backend DTO rejects bypassed invalid input |
| Another operator updates a clean turnover draft | Explicit refresh replaces the local clean values with the server response |
| Current operator has unsaved turnover edits | Refresh retains only those dirty task fields until submit succeeds |
| Rate reader lacks rate-manage | Keep selector/read projection; disable price, policy, and inspection controls |
| Operator switches rate unit before a passive effect runs | Invalidate the loaded unit synchronously; block stale-target submission |
| Confirmed booking arrival date is still in the future | HTTP 409 on `no-show`; do not release occupancy |
| Credential return is retried under another request key | Return the existing record without changing `returned_at` |
| Booking-create role lacks rate-read permission | Unit candidate pagination remains reachable in the booking form |
| Turnover-read role lacks execute permission | Show task/evidence/exception details; hide upload and mutation inputs |
| Open turnover page becomes greater than the new last page | Clamp and reload the new last page |
| Turnover reader lacks `file:read` | Keep task and exception context; do not request `/files` |
| Handover manager lacks `file:upload` | Keep the handover form; omit the upload control |
| Lease reader lacks handover management | Omit mutable handover fields and upload controls |
| Turnover unit is outside the candidate page or suspended | Return and display its list-item unit label |
| Booking unit is outside the candidate page or later suspended | Return and display its list-item unit label |
| Booking unit is inactive at create, confirm, reschedule, or check-in | HTTP 409 |
| Booking occupancy was force released or no longer matches the booked dates | HTTP 409 on check-in |
| Exact nightly total exceeds `numeric(18,2)` | HTTP 400 before booking persistence |
| Pricing operator needs a holiday/special-date price | Web must call `POST /homestay/rates/:unitId/overrides` with business date, positive daily rate, reason, stable retry key, and an in-flight lock |
| Draft or confirmed booking needs new stay dates | Web must expose `POST /homestay/bookings/:id/reschedule`; preserve occupancy swap, nightly repricing, difference ledger, reason, and audit semantics |
| Booking selection changes | Reset every target-bound mutation draft: guest party, credential fields, finance form, cancellation/no-show dialog, and reschedule form |
| Main refresh has a selected booking | Reload list snapshot and `GET /homestay/bookings/:id`; refresh guests, credentials, and ledger under the same selected-ID sequence owner |
| Rate and booking forms paginate unit candidates | Keep independent page state and candidate arrays; changing one form's page must never retarget the other form |
| Rate or booking create submission is slow, double-clicked, or ambiguously fails | Lock synchronously, disable its mutable form, and reuse one key for the unchanged payload until success |
| Booking has multiple declared guests | Render the detail response `guests` roster and verified count; reload after guest registration |
| Turnover attachment was deleted or detached after the task list loaded | Send `photo_file_ids: []` so the backend derives the current active task association; never echo stale task JSON |
| Turnover action is in flight | Disable that task's work-order, exception, consumable, and transition controls until the submitted snapshot succeeds or fails |
| File reader lacks `file:download` | Keep attachment metadata visible, but do not fetch thumbnails and do not render clickable preview affordances |

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
- Bad: clearing the entire booking detail merely because it became terminal, thereby
  removing authorized audit and finance access.
- Bad: exposing a finance or stay button whose required booking list/detail endpoint
  cannot be called by that permission combination.
- Bad: persisting one generic sentence for every cancellation, no-show, or turnover
  exception instead of collecting the operator's actual reason.
- Bad: using list-page membership as the ownership of selected detail, or one boolean
  as proof that form values belong to whichever unit is currently selected.
- Bad: retaining every initialized draft forever; this converts refresh into a stale
  overwrite risk in multi-operator workflows.
- Bad: sharing one paginated candidate list between two mutation forms, echoing
  attachment IDs from a stale aggregate snapshot, or leaving target-bound drafts
  mounted after their booking ID changes.

## 6. Tests Required

- Unit: invalid calendar dates, Shanghai midnight, identity verification prerequisites.
- Unit: end-of-month billing anchors and partial tail periods.
- Unit: decimal-safe purchase line rounding and header reconciliation, including half-cent boundaries.
- Unit: purchase totals near the `numeric(18,2)` boundary remain exact decimal strings.
- Unit/DTO: lease rent and deposit near the `numeric(18,2)` boundary remain exact decimal strings and numeric JSON inputs are rejected.
- Unit: cancellation ignores non-room waivers and dashboard occupancy follows the requested date.
- Unit/DTO: impossible calendar dates, whitespace-only occupancy source identifiers, and identity-change verification reset.
- Unit/DTO: identity-only Party updates use the persisted document type, terminal
  `x` canonicalizes before all protected representations, legacy lowercase hashes
  remain duplicate-protected, and blank role types fail validation.
- DTO: non-empty purchase transfer and explicit Party field clearing.
- Integration: duplicate lease/purchase codes return 409; refunded purchase cannot recharge.
- Integration: held occupancy activation rechecks the latest mode/status and energy-meter plans enforce scope, enable flag, operational status, unit binding, and multiplier.
- Integration: completed handover replay returns the original result before balance/evidence revalidation; move-in rejects move-out-only amounts.
- Integration/API E2E: typed handover evidence appears only in its pending type,
  moves into the completed handover snapshot after submission, and cannot be reused.
- Integration: check-in re-reads current Party verification and identity data instead of trusting the guest-row snapshot.
- Integration: Party identity update and verification take the same write lock;
  homestay guest registration and check-in hold Party read locks while consuming
  verified identity state.
- Integration: first rent uses `first_due_date`; split later periods retain the original lease start-day anchor.
- Frontend: granular roles retain authorized page data and mobile booking cards expose cancellation.
- Frontend: optional dataset failures do not discard successful loads; stale lease-detail responses cannot retarget forms.
- Frontend: finance charge-type derivation, retry-key retention, in-flight submission locking, handover evidence reset, upload context races, pagination, and signed activation visibility.
- Frontend: same-day lease ranges fail native validation, tenant double-click uses one
  key, handover and purchase uploads block submission, refresh errors clear after a
  fully successful refresh, and purchase unit paging is independent from lease paging.
- Frontend: booking-read-only, finance-read, finance-register, and stay-manage fixtures
  independently verify terminal detail retention and exact sub-control visibility.
- Frontend: a no-booking-read fixture receives no booking-bound stay or finance
  capability even when action permissions are present.
- Frontend/browser: cancellation/no-show confirmation requires a real reason; turnover
  exception and consumable controls remain touch-friendly at 390px.
- Frontend: terminal reordering cannot clear selected detail; clean turnover drafts
  accept authoritative refresh while dirty task fields remain local; successful detail
  selection clears a previous detail error.
- Frontend/browser: destructive confirmation shows booking code, unit, and dates;
  rate-read-only controls are disabled; switching units blocks save until that exact
  unit's pricing has loaded.
- API/E2E: with more than one page of history, a new operational booking is on page 1;
  exception description and consumables round-trip through turnover completion.
- Frontend: explicit charge-plan billing, explicit purchase-line recharge selection, occupant/ledger detail rendering, permission-aware KPIs, and aligned desktop/mobile breakpoints.
- DTO/frontend: supported identity-document formats reject arbitrary identifiers and newly created parties remain unverified.
- Integration: overlapping or identical housing billing periods under a new request fail; same-key replay is owned by the idempotency interceptor; concurrent charge-plan upserts cannot create duplicates.
- Integration: final leases reject occupant and ledger writes; manual deposit deduction and voiding a transferred purchase fail.
- Integration: lease activation revalidates its signature attachment, and finance-only detail reads do not expose tenant profile data.
- Unit/integration: fixed rent proration uses exact fractions and preserves cents above JavaScript's safe integer range.
- Integration: guest registration locks the booking against cancellation, no-show, and checkout.
- Integration: housing repair and project-wide purchase attachments enforce their business permission and property data scope.
- Integration: protected evidence binding and generic deletion acquire the same file-row
  lock inside the transaction that writes or checks the business reference.
- Unit/integration: every booking terminal transition that releases occupancy first
  revokes issued credentials.
- Unit: homestay ledger and meter calculations cover values above JavaScript safe
  integer precision plus minimum persisted reading increments.
- DTO/unit: charge-plan source fields are conditionally required and settlement values
  preserve the final cent near the `numeric(18,2)` boundary.
- Integration: cancellation and concurrent credential issuance serialize on the booking
  row, leaving no issued credential after a successful cancellation.
- Integration: transferred purchases reject both refund and void actions.
- Integration: referenced protected evidence rejects generic deletion while unbound
  pending uploads remain removable.
- E2E: an ordinary payment against a deposit receivable produces a deposit receipt and the checkout balance remains consistent.
- Unit: cached idempotent responses preserve `Date` values as ISO strings.
- Unit/integration: meter charge calculation covers a sub-persisted-unit delta whose
  rounded usage differs from the full-precision monetary result.
- Migration/integration: nullable channel names cannot bypass active external-order uniqueness.
- Integration: refund removes purchase cost from the KPI, and an orphaned open turnover
  task still blocks shared availability and mode transition.
- Unit/integration: self-representing turnover occupancy excludes its task while another
  open turnover task still conflicts.
- Unit/API: concurrent initial rate writes use the active partial unique index and rate
  reads round-trip every editable form field.
- Frontend: unit pagination synchronizes rate and booking selections; late rate responses
  cannot overwrite a newer unit selection.
- API/integration: unit candidates enforce short-stay enablement, actor scope, and
  pagination; turnover `open` filtering excludes completed history.
- API/E2E: upload turnover evidence, reload the workflow context, complete with an
  empty client file-ID list, and verify that the backend preserves the associated file.
- Unit/API: no-show fails before Shanghai arrival midnight and succeeds at or after it.
- Integration/API: returning one credential twice preserves its first `returned_at`.
- Frontend/browser: booking-only candidate paging, turnover read/execute control
  projection, exception description, and queue page clamping work at desktop and 390px.
- Frontend/browser: verify domain-only, generic-file-only, both-permission, and
  neither-permission combinations for every file-backed form or evidence list.
- API/E2E: a turnover item returns its own `unitCode` and `unitName` even when that
  unit is outside the current candidate selector page.
- API/E2E: a booking item returns its own `unitCode` and `unitName`; inactive units reject
  booking writes, force-released occupancies reject check-in, and aggregate price overflow
  is rejected before persistence.
- API/E2E: a lease page returns its own unit and tenant labels independently of
  candidate pages; generic occupancy creation cannot forge housing/homestay ownership.
- Frontend: permission fixtures cover every mutation form, not only its submit button;
  page changes and refresh/revisit recover or clear the full selected-lease context.
- Unit/integration: concurrent dated override writes use atomic upsert; dashboard
  status matrices cover confirmed, checked-in, checked-out, deleted, and inactive rows.
- Frontend: double-click lease creation issues one request and ambiguous retry reuses
  the same idempotency key; terminal booking refresh clears its action panel.
- Frontend/browser: date override and booking reschedule are reachable on desktop and
  390px; both send validated reasons and retain one retry key for an unchanged payload.
- Frontend: rate and booking candidate pagination are independent; a page change in one
  form cannot alter the other form's selected unit or remaining draft fields.
- Frontend: changing booking selection clears guest, credential, finance, termination,
  and reschedule drafts; explicit refresh reloads guest roster, credentials, and ledger.
- Frontend: read-without-download attachment fixtures issue no `/download` requests;
  turnover actions send an empty photo list and disable task drafts while submitting.
- Frontend/API: same-booking reload failure preserves the previous detail; turnover
  submission disables upload and deletion; concurrent first-guest registration leaves
  exactly one primary guest; a zero dated rate is rejected.
- Frontend/API: tenant creation omits uncollected consent, repair double-click emits
  one request, ambiguous retry retains its key, and reload excludes work-order-bound
  evidence from the next repair draft.
- Frontend/API: a running repair upload disables work-order creation until its callback
  settles; lease-detail failure blocks the form instead of treating attachment recovery
  as empty; the server projection and create-time conflict guard own consumption.

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

const ready = loadedRateUnitId === selectedUnitId && !rateLoading;
const nextDraft = dirtyTaskIds.has(task.id) ? localDraft : serverDraft;

const bookingCreateKey = retryKeyForUnchangedPayload(payload);
const rateUnits = await loadCandidates(rateUnitPage);
const bookingUnits = await loadCandidates(bookingUnitPage);
await executeTurnover(task.id, { photo_file_ids: [] }); // backend derives active files

const minimumLeaseEnd = addBusinessDateDays(leaseStart, 1);
const leaseUnits = await loadUnits(leaseUnitPage);
const purchaseUnits = await loadUnits(purchaseUnitPage);
const handoverBizType = `housing_handover_${handoverType}`;
```
