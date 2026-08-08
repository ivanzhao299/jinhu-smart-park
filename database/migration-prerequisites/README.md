# Migration Prerequisites

This directory contains narrowly scoped SQL prerequisites for historical migrations
that cannot be edited after successful deployment.

Layout:

```text
database/migration-prerequisites/
  <target-migration-name-without-.sql>/
    <ordered-prerequisite>.sql
```

The runner always evaluates prerequisites in migration order, including prerequisites
newly attached to an already-succeeded earlier target. This lets partially initialized,
fully migrated, and deliberately baselined databases acquire a newly discovered
dependency. Checksum-matched migrations and prerequisites are skipped individually;
migration-only history never bypasses prerequisite inspection.

Each prerequisite receives its own checksum and running/succeeded/failed history
record in both migration history tables. Any prerequisite failure stops before later
pending migrations execute.

Prerequisites are not production seeds. They must contain only the minimum
production-safe state required for the target migration, be idempotent, and must not
create credentials, demo data, or silently expand business authorization.

Do not use this mechanism to revise a successful migration or bypass its checksum.

The `000189` asset repair first restores the `asset_park.tenant_id/park_id`
`varchar(64)` contract established by migration `000029` when a deliberately
baselined legacy database still exposes the original UUID columns. It converts only
those two scope columns, rewrites only the two canonical legacy sentinel UUIDs, and
fails closed for missing or unexpected column types. The following bounded,
insert-only prerequisite materializes only a missing `asset_park` projection for an
already-active asset module assignment whose tenant and canonical `biz_park` scope
are both uniquely valid. Existing asset rows are not re-enabled or overwritten.
This allows the unchanged historical `000189` and `000200` migrations to keep
enforcing their signed asset-domain scope contract.

The two history rows for one execution are written in one database transaction.
After bootstrap, any status/checksum disagreement between the history tables fails
before prerequisite or migration execution and requires manual inspection.
