# Asset To Operating Space Mapping

## Scenario: Convert physical asset space into operating space

### 1. Scope / Trigger

- Trigger: a physical `asset_building` / `asset_floor` / `asset_unit` must become selectable by leasing, apartment, energy, work-order, or other operating domains.
- Keep `asset_*` as physical source and `biz_*` as operating source; never merge rows by matching names or codes alone.

### 2. Signatures

- `GET /assets/operating-space-candidates`
- `POST /assets/buildings/:id/operating-building`, body `{ mode: "create" | "link", businessId?: uuid, reason: string }`
- `POST /assets/floors/:id/operating-floor`, same discriminator contract.
- `POST /assets/units/:id/operating-unit`, body includes `usageType`, `rentalStatus`, `fittingStatus`, optional operating values, and `reason`.
- Every write requires `X-Idempotency-Key` (8–128 characters).
- DB mappings: `biz_building.asset_building_id`, `biz_floor.asset_floor_id`, existing `biz_unit.asset_unit_id`, plus append-only `biz_asset_space_mapping_audit`.

### 3. Contracts

- Map the asset building before its floor, and the floor before converting its unit.
- A transaction-level advisory lock is keyed by scope, entity type, and asset id; source rows are reread `FOR UPDATE`.
- An active asset object maps to at most one active operating object. The service and database both enforce scope and parent-chain identity.
- Source numeric values remain PostgreSQL decimal strings through the service; do not round-trip them through JavaScript arithmetic.
- Create, link, and unlink append reason, operator, idempotency key, source/target ids, and snapshot to immutable audit history.
- A trigger function shared by heterogeneous tables must test table-specific fields through `to_jsonb(NEW)->>'field'`; direct `NEW.table_specific_field` access in a branch condition is unsafe because PostgreSQL binds the record field for every attached row type.

### 4. Validation & Error Matrix

- source absent, deleted, or outside scope -> not found.
- parent mapping absent or points at a different source parent -> conflict.
- target code already active -> conflict; do not silently rename.
- same idempotency key and same request -> original target.
- same key for another asset -> conflict.
- different key competing for an already mapped asset -> conflict after the lock; only one target remains.
- update/delete of mapping audit -> database rejection.

### 5. Good / Base / Bad Cases

- Good: explicitly create/map building, map floor, then convert unit; all three audit rows are present.
- Base: replay the winning unit key and return the same `biz_unit` without a duplicate.
- Bad: select an operating floor by equal display name, or create a unit while its parent mapping is missing.

### 6. Tests Required

- Static schema assertions: active unique indexes, parent-chain triggers, append-only audit, and `to_jsonb(NEW)` field guards.
- Controller contract: granular asset create permissions, audit decorator, and true idempotency interceptor.
- Disposable PostgreSQL: two different keys race on one asset unit; assert one success, one conflict, one `biz_unit`, winning-key replay, and exact decimal strings.
- Browser: authenticated desktop and 390px checks; incomplete parents disable later actions and errors render inside the drawer.

### 7. Wrong vs Correct

#### Wrong

```sql
IF TG_TABLE_NAME = 'biz_building' AND NEW.asset_building_id IS NOT NULL THEN
  -- Fails when this function is invoked for a row type without asset_building_id.
END IF;
```

#### Correct

```sql
IF TG_TABLE_NAME = 'biz_building'
   AND (to_jsonb(NEW)->>'asset_building_id') IS NOT NULL THEN
  -- Table-specific access below is reached only for the matching row type.
END IF;
```
