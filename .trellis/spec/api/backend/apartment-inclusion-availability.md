# Apartment Inclusion And Availability

## 1. Scope / Trigger

- Trigger: an existing `biz_unit` is considered for apartment operation, or an existing apartment room changes management state or capacity.
- `biz_unit` remains the operating-space source. Apartment management adds a domain configuration and occupancy; it never recreates the physical asset or operating unit.

## 2. Signatures

- `GET /apartments/unit-candidates?page=1&page_size=20&keyword=&building_id=&floor_id=&eligible_only=false` returns `{ items, total, page, page_size, facets }`.
- `POST /apartments/rooms` accepts the existing room configuration contract and revalidates `unit_id` inside its transaction.
- `PATCH /apartments/rooms/:id` accepts `management_status: enabled | disabled` and capacity changes from 1 through 20.

## 3. Contracts

- Candidate listing and final write use the same SQL eligibility projection. The service locks the operating unit before the final single-unit recheck; the Web is never an authority.
- Every candidate includes a stable `eligible` boolean, machine-readable `ineligible_reasons`, physical-asset mapping state, property-operation state/mode, and energy-meter count.
- A unit with `asset_unit_id` must have a complete and matching asset building/floor parent chain. An unmapped external or managed operating unit remains compatible and is explicitly labeled.
- Enabling apartment management owns exactly one apartment-source property occupancy. Disabling releases it; restoring reactivates the same released source row when present because source lifetime identity is unique.
- A room cannot be disabled while a `reserved`, `active`, or `checkout_pending` stay exists.
- Capacity expansion restores stable disabled bed codes before inserting. Capacity reduction disables only highest-code beds with no stay history and never deletes a bed.

## 4. Validation & Error Matrix

- existing apartment room -> `already_apartment_managed`.
- disabled operating unit -> `unit_disabled`.
- mapped unit with incomplete/mismatched physical parents -> `asset_parent_mapping_incomplete`.
- explicitly disabled property-operation configuration -> `operating_config_disabled`.
- non-apartment operating mode -> `operating_mode_conflict`.
- active or unexpired held occupancy from another source -> `occupied_by_other_domain`.
- stale candidate that becomes unavailable before submit -> conflict after lock and recheck.
- shrink below active stays, or without enough history-free beds -> conflict with no partial mutation.

## 5. Good / Base / Bad Cases

- Good: select a mapped, parent-complete unit; create a room and apartment reservation occupancy; later hand it to the energy workflow through the same unit identity.
- Base: disable an unused room, releasing its occupancy, then restore it and reactivate the same occupancy row.
- Bad: copy a unit into a new apartment-only room table, trust an old browser candidate, delete beds with stay history, or create a second occupancy for the same apartment source.

## 6. Tests Required

- Contract tests for bounded pagination, filters, reason projection, lock-before-recheck, occupancy state transitions, and historical-bed guards.
- Disposable PostgreSQL test for creation, empty-page totals, safe shrink, disable/release, restore/reactivate, and cleanup.
- API and Web typecheck/lint/build plus the apartment management contract script.
- Authenticated desktop and 390px browser checks when credentials are available; otherwise record the skipped visual check explicitly.

## 7. Wrong vs Correct

### Wrong

```ts
const candidate = await this.unitCandidates(scope);
await roomRepository.save({ unitId: dto.unit_id });
```

### Correct

```ts
await manager.query("SELECT id FROM biz_unit WHERE id=$1 FOR UPDATE", [dto.unit_id]);
const candidate = await this.loadCandidate(manager, scope, dto.unit_id);
if (!candidate.eligible) throw new ConflictException(candidate.ineligible_reasons);
```
