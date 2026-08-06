# 000198 Property Finance Owner Integrity Reservation + Schema Handoff v1

Status: **FORMAL FORWARD-FIX GO / PostgreSQL 16 / open_P0_P1=[]**

Issued at: `2026-08-03T21:32:00+08:00`

## Scope and frozen identity

- active task: `.trellis/tasks/07-30-pr192-b-domain-integrations`
- repository base: `0152616fb9a25effdff68fa9da24fea7db8a21a7`
- predecessor migrations remain immutable:
  `000191_property_b_homestay_effect_schema.sql`,
  `000192_property_b_housing_effect_schema.sql`, and
  `000197_property_approval_active_source_index_forward_fix.sql`
- reserved migration:
  `database/migrations/000198_property_finance_owner_integrity_forward_fix.sql`
- migration raw SHA-256:
  `f722e626d83d1ce2f4d863719105b2e25361a1ea058ce9da10d96694fc2d4620`
- PostgreSQL integration spec SHA-256:
  `7c63091d90eb393b581fe3312f457f7dacdc0e7f430ada1b4b23e0906aafc3d8`
- DEC-02 decision spec SHA-256:
  `81572add259e80c03d4a2a9894d9725e5a85d142e1891eab67aa05bed4610ab2`
- homestay service snapshot SHA-256:
  `edfc38823074c80d7b6fdf7723f4a69f6363c74cf9ebeb7f801c572318f4129d`

This handoff records a new forward fix. It does not replace the selected DEC-01..06
authority, the 000191/000192 schema handoffs, or the 000197 execution authority.

## Fresh reservation scans

Immediately before file creation, the schema-migration owner performed read-only
scans of:

1. the current migration filesystem (`rg --files database/migrations`), where the
   last existing number was 000197 and no `000198_*` existed;
2. every live Git worktree reported by `git worktree list --porcelain`, followed by a
   filesystem search for `*/database/migrations/000198_*`; no collision existed;
3. both `public.sys_schema_migration_history` and `public.schema_migrations` in every
   database reachable with the configured PostgreSQL role across all running
   PostgreSQL 16 evidence containers; no filename beginning `000198` existed;
4. the default development PostgreSQL database, using its configured `jinhu` role,
   for the same two history tables; no filename beginning `000198` existed.

The exact filename was then reserved by creating the migration in the active worktree.
No default-database migration or history write was performed.

## Schema contracts delivered

- Housing ledger rows that name a receivable now use a composite FK proving the same
  tenant, park, lease, and currency as that receivable.
- A transferred purchase item now proves that its target receivable is owned by the
  same purchase through `source_type=purchase_transfer` and `source_id=purchase_id`.
- The item-owner FK and transfer-audit lifecycle FK are
  `DEFERRABLE INITIALLY DEFERRED`, matching the frozen DEC-05 order in which purchase
  and item CAS/audit occur before a newly reserved aggregate receivable is inserted.
- Each purchase-transfer audit proves the target receivable has the same lease,
  currency, and purchase lifecycle.
- Homestay direct finance and immutable legacy mappings share the same canonical
  advisory source fence. Source/result rows are locked in UUID order, direct and
  mapped result identities must be disjoint, and the database rejects aggregate
  allocation above the confirmed source amount.
- A legacy mapping additionally consumes the frozen source expected version and
  currency. An approval-owned ordinary refund/waiver requires its direct source;
  DEC-01's compound room-cancellation waiver remains the explicit source-less
  exception because it is owned by the frozen cancellation contributor set.

## PostgreSQL 16 evidence

Evidence container `jinhu-b2c191192-pg16-20260803b` reported PostgreSQL
`server_version_num=160014`. Two explicitly named disposable databases were used and
then deleted:

- `jinhu_d5_000198_20260803a`
- `jinhu_d5_000198_rollback_20260803a`

The successful database was cloned from the verified 000191+000192 baseline. Applying
000198 with `ON_ERROR_STOP=1` completed `BEGIN`, preflight, four `ALTER TABLE`
statements, both trigger-function replacements, and `COMMIT`.

The real PostgreSQL matrix passed:

- new aggregate target: purchase item CAS and transfer audit were written before the
  target receivable, after which `SET CONSTRAINTS ALL IMMEDIATE` succeeded;
- wrong purchase owner on a transferred item failed the deferred composite FK;
- a housing ledger row pointing at a receivable from another lease failed immediately;
- a legal direct plus legacy-mapped homestay allocation succeeded;
- an additional direct allocation above the remaining balance failed with SQLSTATE
  `23514`;
- an additional legacy mapping above the remaining balance failed with SQLSTATE
  `23514`;
- the existing DEC-01 atomic cancellation and DEC-02 direct+mapped over-allocation
  PostgreSQL regression passed on the 000198 schema.

For rollback evidence, the second disposable clone intentionally lacked the expected
predecessor FK. The 000198 preflight raised
`000198 expected predecessor constraints are missing` before any schema mutation.
After failure, the new generated item-owner column count was zero and the original
purchase-item receivable FK count remained one.

## Commands and quality gates

- `pnpm --filter @jinhu/api typecheck` — PASS.
- `pnpm --filter @jinhu/api lint` — PASS.
- homestay decision/service unit selection — PASS, 21/21.
- DEC decision unit selection after stale mapping-version coverage — PASS, 3/3.
- real PostgreSQL DEC-01/02 atomic plus 000198 owner-integrity specs — PASS, 2/2.
- targeted `git diff --check` — PASS.

## History rerun semantics and open risk

The production migration runner owns same-byte rerun behavior: a succeeded filename
with the same checksum is skipped through the two synchronized history stores; a
different checksum fails before execution. That established runner behavior is not
equivalent to feeding the raw SQL to `psql` twice. Raw replay is deliberately
fail-loud because the predecessor constraints have already been replaced; it is not
an idempotent migration contract.

This lane did not write a synthetic 000198 success row into the default or shared
history tables merely to repeat the already established history-skip test. Production
and shared environments must execute 000198 only through `scripts/db-migrate.sh` and
must preserve the frozen raw SHA above.

Open lower-priority risk: the history-skip path was not re-executed with a synthetic
000198 row in this lane to avoid mutating shared/default migration history. This is an
operational evidence limitation, not an open P0/P1 schema defect.

`open_P0_P1=[]`.
