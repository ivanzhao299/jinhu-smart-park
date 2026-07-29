# Shared Property Occupancy Contract

## 1. Scope / Trigger

Apply this contract whenever code creates, changes, releases, or checks availability for a `biz_unit` used by commercial leasing, homestay, housing rental, maintenance, cleaning, or operations locking.

The same whole unit may switch between long-rent and short-stay operation, but active periods must never overlap across business domains or legacy commercial contracts.

## 2. Signatures

Primary service contracts:

```ts
checkAvailability(unitId, [startAt, endAt), excludeSource?)
createOccupancy(source, [startAt, endAt), status)
activateOccupancy(occupancyId)
releaseOccupancy(occupancyId, reason)
transitionOperatingMode(unitId, targetMode, reason)
```

Database owners:

- `biz_unit.asset_unit_id`: physical-to-operating unit mapping.
- `biz_property_operation_config`: current mode and operating status.
- `biz_property_occupancy`: shared period ledger.
- `rel_leasing_contract_unit`: legacy commercial leasing compatibility source.

## 3. Contracts

- Period semantics are always `[start_at, end_at)` and require `start_at < end_at`.
- Date-only commercial contract boundaries are converted at `00:00 Asia/Shanghai` before comparison with `timestamptz` occupancy periods; the inclusive contract end date becomes the next Shanghai midnight.
- Every service-level commercial-contract/shared-occupancy comparison must use explicit `AT TIME ZONE 'Asia/Shanghai'`; PostgreSQL session timezone is never part of the domain contract.
- Active blocking statuses are `active` and unexpired `held`.
- `held` requires `hold_expires_at`.
- Modes are `none`, `short_stay`, and `long_rent`.
- `homestay` requires `short_stay`.
- `housing_rental` and `commercial_leasing` require or are treated as `long_rent`.
- `maintenance` and `operations` may lock a unit in any mode.
- New commercial-leasing, housing-rental, and homestay occupancies require `operating_status = enabled`; `suspended` and `disabled` units reject new business occupancy.
- Business occupancy creation, activation, and period replacement also require the
  underlying `biz_unit.status = 1` in the same transaction.
- Activating a `held` occupancy is a new concurrency-sensitive write: lock the unit scope and re-read the current operation configuration inside the same transaction before changing status to `active`.
- Replacing an occupancy period is also a concurrency-sensitive write: after locking
  the unit scope, release expired holds, re-read current mode/status, and only then
  check conflicts and save.
- Period replacement is period-only, not a lifecycle transition. Under the lock it
  must match the caller's exact source domain/type/ID, current period, and expected
  `held` or `active` status. It preserves that status and never clears terminal
  release metadata.
- A released occupancy or expired hold cannot be resurrected by period replacement.
  The owning workflow must reject it or create a new occupancy through an explicit
  lifecycle action.
- Occupancy source type and source ID must remain non-empty after boundary trimming.
- An unfinished homestay turnover task keeps the unit unavailable even when a same-day arriving booking already owns the active occupancy and no separate turnover occupancy can be created.
- Homestay availability reads both the shared occupancy ledger and active legacy commercial-contract relations before reporting a unit available.
- All writes require `X-Idempotency-Key` and `IdempotencyInterceptor`.
- Public generic occupancy creation accepts only genuinely generic ownership domains.
  `commercial_leasing`, `housing_rental`, and `homestay` occupancies are created only
  through their owning aggregate workflows, which may call the internal transactional
  service after persisting and locking the source record.
- Public generic occupancy activation follows the same ownership boundary: business-owned
  holds can be activated only by their owning aggregate workflow.
- Production requires stable `PARTY_DATA_ENCRYPTION_KEY` with at least 32 characters.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| `start_at >= end_at` | HTTP 400 |
| Occupancy domain does not match mode | HTTP 409 |
| New business occupancy targets a suspended/disabled unit | HTTP 409 |
| Homestay booking/check-in targets a unit with unfinished turnover | HTTP 409 |
| Held occupancy expires, changes mode compatibility, or becomes disabled before activation | HTTP 409 |
| Period replacement targets a now-disabled or mode-incompatible business unit | HTTP 409 |
| Period replacement finds a released occupancy, expired hold, changed period/status, or mismatched source | HTTP 409 without clearing release metadata |
| Occupancy source identifier is whitespace-only | HTTP 400 |
| Active/held period overlaps shared occupancy | PostgreSQL `23P01`, translated to HTTP 409 |
| Shared occupancy overlaps legacy commercial contract | Trigger `23P01`, translated to HTTP 409 |
| UTC database session compares a date-only commercial contract | Use explicit `AT TIME ZONE 'Asia/Shanghai'`; never rely on session timezone casts |
| Commercial contract targets short-stay unit or overlaps shared occupancy | Trigger/service HTTP 409 |
| Mode switch has future occupancy, contract, pending checkout, open work order, or unsettled receivable | HTTP 409 with check snapshot |
| Unit, party, or occupancy belongs to another tenant/park | HTTP 404/403 without cross-scope data |
| Sensitive party field requested without `party:sensitive_read` | Return masked projection only |
| Generic occupancy route claims `commercial_leasing`, `housing_rental`, or `homestay` | HTTP 403 before any occupancy transaction |
| Generic activation targets a business-owned hold | HTTP 403 before activation |
| Business occupancy targets an inactive `biz_unit` during create, activate, or period replacement | HTTP 409 |

## 5. Good / Base / Bad Cases

- Good: one occupancy ends at `2026-08-02T04:00:00Z`; the next starts at the same instant.
- Good: a commercial contract ending `2026-07-25` does not block a short stay starting `2026-07-26T00:00:00+08:00`.
- Good: a same-day arrival already occupies the period at checkout; create the turnover task without an overlapping operations occupancy and block check-in until turnover completes.
- Good: an occupancy held in short-stay mode is rejected at activation if the unit has since switched mode or been suspended.
- Base: a legacy commercial contract remains in `rel_leasing_contract_unit`; availability reads it without bulk history migration.
- Bad: availability checks only `operating_mode = short_stay` and reports a suspended unit as available.
- Bad: a homestay order inserts directly into its own table and derives room state without calling the shared occupancy service.
- Bad: service code checks overlap and inserts later without the shared transaction advisory lock/trigger contract.
- Bad: rescheduling a booking rewrites a released occupancy back to `active`.

## 6. Tests Required

- Unit: `[start, end)` adjacency and overlap.
- Unit: source-domain-to-mode compatibility.
- DTO: whitespace-only source identifiers fail after transforms run.
- Schema: GiST exclusion constraint, shared advisory lock, and both cross-table triggers exist.
- Schema: both cross-table triggers explicitly convert commercial contract dates at the Shanghai business boundary.
- Integration: two concurrent occupancy inserts for the same unit/period yield one success and one HTTP 409.
- Integration: commercial contract versus homestay occupancy race yields one success and one HTTP 409.
- E2E: tenant/park/data-scope isolation, mode blocker snapshot, idempotent replay, forced release permission.
- E2E: suspended/disabled units reject new bookings; same-day back-to-back checkout succeeds while the next check-in remains blocked until turnover completion.
- Integration: changing mode/status between hold creation and activation is observed by the activation transaction.
- Integration: period replacement releases expired holds and observes a mode/status change made after the original occupancy was created.
- Unit/integration: exact active and unexpired-held occupancies allow period replacement;
  released, expired, source-mismatched, status-mismatched, and stale-period inputs reject it.
- E2E: force release followed by reschedule returns HTTP 409 and leaves the occupancy released.
- Integration: availability remains unavailable for an overlapping active legacy commercial contract, including when the database session timezone is UTC.
- Security: plaintext identity is absent from persistence and audit logs; authorized detail decrypts, normal detail masks.
- API/E2E: the generic create route rejects every business-owned source domain while
  legitimate aggregate workflows still create their scoped occupancy.
- Unit/integration: business create, activation, and period replacement each observe an
  inactive unit; the public generic activation route cannot advance a business-owned hold.

## 7. Wrong vs Correct

### Wrong

```ts
if (!(await ownOrderRepository.hasOverlap(unitId, startAt, endAt))) {
  await ownOrderRepository.save(order);
}
```

This checks only one domain and has a race between the query and insert.

### Correct

```ts
await propertyOccupanciesService.create(scope, actor, {
  unit_id: unitId,
  source_domain: "homestay",
  source_type: "homestay_booking",
  source_id: orderId,
  start_at: startAt,
  end_at: endAt,
  status: "active"
}, idempotencyKey);
```

The shared service validates the mode and period; database exclusion plus cross-table advisory-lock triggers provide the final concurrency barrier.
