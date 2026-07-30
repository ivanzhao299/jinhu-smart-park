# Migration Prerequisites

This directory contains narrowly scoped SQL prerequisites for historical migrations
that cannot be edited after successful deployment.

Layout:

```text
database/migration-prerequisites/
  <target-migration-name-without-.sql>/
    <ordered-prerequisite>.sql
```

The migration runner executes these files only when the target migration has not
already succeeded. Each prerequisite receives its own checksum and running/succeeded/
failed history record in both migration history tables. Any prerequisite failure stops
before the target migration is marked running.

Prerequisites are not production seeds. They must contain only the minimum
production-safe state required for the target migration, be idempotent, and must not
create credentials, demo data, or silently expand business authorization.

Do not use this mechanism to revise a successful migration or bypass its checksum.
