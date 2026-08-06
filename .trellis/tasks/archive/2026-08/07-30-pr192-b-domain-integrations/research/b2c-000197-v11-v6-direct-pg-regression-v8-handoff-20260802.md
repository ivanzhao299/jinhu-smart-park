# B2c 000197 v11-v6 direct-PG regression v8 handoff

Status: `SEALED-AWAITING-DB-QA-DRAIN-RESOURCE`. v8 preserves v7 and performs no Docker, database, resource, migration, or cleanup operation.

`executeV8` is the only public v8 execution entry point. It accepts no raw target and seals all candidate, DB, QA, drain, resource and immutable identity-registry inputs before an evidence root is derived or a child process can be called. Its private delegate receives only sealed authority output.

The immutable registry inventories retained G/H and v4 identities. A later resource authority must bind its registry SHA and prove the fresh v8 runId/container/database/anonymous volume are absent from it, while still binding full IDs, PG16-alpine identity, no host ports and all three review SHAs.

Each fault has a separate 0444 safe summary containing only its boundary, `P0001`, expected/observed marker, and `snapshotExact`. Marker matching rejects duplicate, extra and wrong markers. Node22/24 raw TAP artifacts are preserved and their SHA values are bound in the static test record.
