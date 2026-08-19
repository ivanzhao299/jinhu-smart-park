# Apartment Handover Energy Integration

## 1. Scope / Trigger

- Trigger: an apartment stay performs move-in or move-out handover for a room whose canonical `biz_unit` may have enabled water or electric meters.
- The apartment handover is the field-operation snapshot; `energy_reading` remains the canonical metering ledger.

## 2. Signatures

- `GET /apartments/stays/:id/handover-meters` returns enabled, non-disabled `WATER` and `ELECTRIC` meters attached to the stay's `biz_unit` through `energy_meter.room_id`.
- Handover body accepts `meter_readings: Array<{ meter_id: uuid, reading_value: decimal-string }>`.
- Legacy `water_meter_reading` and `electricity_meter_reading` remain accepted only when each supplied type resolves to exactly one meter.
- `energy_reading` source identity is `(source_domain, source_type, source_id)` with apartment values `apartment`, `move_in_handover|move_out_handover`, and the handover UUID.

## 3. Contracts

- Lock the stay/room, shared operating-unit scope, and all eligible unit meters in one transaction before validating readings.
- If the unit has eligible water/electric meters, the submission must cover every meter exactly once. A unit with none remains compatible and stores only the handover record.
- Meter identity always comes from `stay -> apartment_room.unit_id -> energy_meter.room_id`; never match by display name, code prefix, or building text.
- Handover insertion, confirmed energy readings, meter current values, and stay/application status transition commit atomically.
- Decimal comparison and consumption calculation happen in PostgreSQL numeric arithmetic. Do not convert readings through JavaScript `Number`.
- Handover readings are immediately `CONFIRMED`, and update `current_reading`, `last_reading_at`, and online status.
- One meter may have at most one reading for a given handover source. The database partial unique index is the final retry barrier.

## 4. Validation & Error Matrix

- stay outside tenant/park, deleted room, or invalid lifecycle state -> conflict/not found without meter disclosure.
- duplicate submitted meter ID -> bad request and full rollback.
- missing eligible meter or extra/cross-unit meter -> bad request and full rollback.
- legacy scalar with zero or multiple meters of that type -> conflict; require explicit meter identity.
- reading below locked current reading -> conflict; no handover, reading, meter, or stay mutation commits.
- concurrent meter advance before lock/recheck -> compare against the newly locked current reading and fail closed.
- no eligible water/electric meters -> handover succeeds with an empty energy-reading list.

## 5. Good / Base / Bad Cases

- Good: move-in reads two unit meters, records confirmed baselines, and activates the stay in one commit.
- Base: an external managed room has no registered meter and completes its operational handover without fabricating energy data.
- Bad: store a water value only on `biz_apartment_handover`, infer a meter by type when two exist, or update the stay before energy insertion.

## 6. Tests Required

- DTO/static contract: explicit UUID/decimal input, canonical unit join, lock order, confirmed source-linked insert, and database uniqueness.
- Disposable PostgreSQL: create room/stay/meter, complete move-in, assert exact decimal ledger/current values, then prove a reverse move-out reading rolls back.
- Apartment E2E contract plus API/Web lint, typecheck, and production build.
- Authenticated desktop and 390px field-operation checks when credentials are available; explicitly record when unavailable.

## 7. Wrong vs Correct

### Wrong

```ts
handover.waterMeterReading = dto.water_meter_reading;
stay.status = "active";
```

### Correct

```ts
await manager.query("SELECT ... FROM energy_meter ... FOR UPDATE");
await manager.query("INSERT INTO energy_reading (... source_id ...) VALUES (...)");
await manager.query("UPDATE energy_meter SET current_reading=...");
await manager.query("UPDATE biz_apartment_stay SET status=...");
```
