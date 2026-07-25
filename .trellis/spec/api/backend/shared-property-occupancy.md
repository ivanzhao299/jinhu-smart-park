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
- Active blocking statuses are `active` and unexpired `held`.
- `held` requires `hold_expires_at`.
- Modes are `none`, `short_stay`, and `long_rent`.
- `homestay` requires `short_stay`.
- `housing_rental` and `commercial_leasing` require or are treated as `long_rent`.
- `maintenance` and `operations` may lock a unit in any mode.
- All writes require `X-Idempotency-Key` and `IdempotencyInterceptor`.
- Production requires stable `PARTY_DATA_ENCRYPTION_KEY` with at least 32 characters.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| `start_at >= end_at` | HTTP 400 |
| Occupancy domain does not match mode | HTTP 409 |
| Active/held period overlaps shared occupancy | PostgreSQL `23P01`, translated to HTTP 409 |
| Shared occupancy overlaps legacy commercial contract | Trigger `23P01`, translated to HTTP 409 |
| Commercial contract targets short-stay unit or overlaps shared occupancy | Trigger/service HTTP 409 |
| Mode switch has future occupancy, contract, pending checkout, open work order, or unsettled receivable | HTTP 409 with check snapshot |
| Unit, party, or occupancy belongs to another tenant/park | HTTP 404/403 without cross-scope data |
| Sensitive party field requested without `party:sensitive_read` | Return masked projection only |

## 5. Good / Base / Bad Cases

- Good: one occupancy ends at `2026-08-02T04:00:00Z`; the next starts at the same instant.
- Base: a legacy commercial contract remains in `rel_leasing_contract_unit`; availability reads it without bulk history migration.
- Bad: a homestay order inserts directly into its own table and derives room state without calling the shared occupancy service.
- Bad: service code checks overlap and inserts later without the shared transaction advisory lock/trigger contract.

## 6. Tests Required

- Unit: `[start, end)` adjacency and overlap.
- Unit: source-domain-to-mode compatibility.
- Schema: GiST exclusion constraint, shared advisory lock, and both cross-table triggers exist.
- Integration: two concurrent occupancy inserts for the same unit/period yield one success and one HTTP 409.
- Integration: commercial contract versus homestay occupancy race yields one success and one HTTP 409.
- E2E: tenant/park/data-scope isolation, mode blocker snapshot, idempotent replay, forced release permission.
- Security: plaintext identity is absent from persistence and audit logs; authorized detail decrypts, normal detail masks.

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
