# TypeORM Raw Query Result Shapes

## 1. Scope / Trigger

Apply this contract when Nest services consume PostgreSQL DML results returned by
TypeORM `EntityManager.query()` or `QueryRunner.query()`, especially
`UPDATE ... RETURNING` used as an optimistic-version CAS or effect-cardinality fence.

## 2. Signatures

```ts
typeormQueryRows<T>(result: unknown, operation: string): T[]
```

The current PostgreSQL driver may return either `T[]` or `[T[], rowCount]` for raw
DML with `RETURNING`. Callers consume rows only through the helper in
`apps/api/src/shared/property-workbench/typeorm-query-rows.ts`.

## 3. Contracts

- The helper unwraps the PostgreSQL `[rows, rowCount]` tuple and accepts a direct
  row array used by existing unit-test fixtures.
- A tuple row count must be a non-negative integer and equal `rows.length`.
- Malformed results fail closed; they are never interpreted as a successful CAS.
- CAS code validates the unwrapped row cardinality and returned version before
  recording an approval effect or advancing aggregate state.
- This normalization does not replace the database `WHERE version = $expected`
  predicate, owning unique constraint, or surrounding transaction.

## 4. Validation & Error Matrix

| Result | Required behavior |
|---|---|
| `[{ id, version }]` | Return the direct fixture rows |
| `[[{ id, version }], 1]` | Return the PostgreSQL rows |
| `[[], 0]` | Return empty; caller reports stale/conflict |
| Tuple count differs from row length | Throw an internal contract error |
| Non-array, nested malformed rows, or invalid count | Throw an internal contract error |

## 5. Good / Base / Bad Cases

- Good: a one-row `UPDATE ... WHERE version=$n RETURNING id,version` unwraps to one
  row and the caller verifies `version === n + 1`.
- Base: a direct array repository fixture remains usable without emulating driver
  internals.
- Bad: checking `rawResult.length === 1` directly; a successful PostgreSQL tuple has
  length two and is falsely translated to HTTP 409.

## 6. Tests Required

- Unit: direct row arrays and `[rows, rowCount]` tuples unwrap identically.
- Unit: zero rows, count mismatch, invalid count, and malformed shapes fail closed.
- PostgreSQL integration: execute a real `UPDATE ... RETURNING` and assert one CAS
  success plus a stale-version zero-row result.
- Financial/approval integration: inject a later-effect failure and assert the earlier
  CAS update rolls back in the same transaction.

## 7. Wrong vs Correct

### Wrong

```ts
const rows = await manager.query("UPDATE ... RETURNING id, version", params);
if (rows.length !== 1) throw new ConflictException("stale version");
```

### Correct

```ts
const raw = await manager.query("UPDATE ... RETURNING id, version", params);
const rows = typeormQueryRows<{ id: string; version: number }>(raw, "update occupancy");
if (rows.length !== 1 || rows[0]?.version !== expectedVersion + 1) {
  throw new ConflictException("stale version");
}
```
