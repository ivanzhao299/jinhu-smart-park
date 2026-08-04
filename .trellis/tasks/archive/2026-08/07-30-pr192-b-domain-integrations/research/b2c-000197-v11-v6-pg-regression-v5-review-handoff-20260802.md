# B2c 000197 v11-v6 static contract-correction candidate

Status: `SEALED-STATIC-CONTRACT-CORRECTION-ONLY`. No Docker, PostgreSQL, runner, cleanup, resource, or migration execution was performed or authorized by this candidate.

## Finding

The direct G/H PostgreSQL 16.14 build applied the frozen migration bytes through `000195` and observed old active-source hashes:

- index definition: `97c69ee1170f416bb00eb2ab5dbec9c5fea75b257c6394be1c80c136b70a0720`;
- predicate: `8d3c44fdcea64e3ee4b4fa1a399b568dca4dd5c7c0200a3aa040204b83cc5f65`.

They do not equal the old-hash constants embedded in applied `000197` (`89d630…` and `d47740…`). The observation is bound to raw `000186` SHA `5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e` and applied `000197` SHA `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`. A direct-build regression must therefore fail closed; replacing `pg_dump` with a direct migration build does not repair the actual contract defect.

There is a second independently visible naming defect in the v4 regression snapshot: it checks for the nonexistent `_v4_build` residue, whereas `000197` creates `_v2_build`. Any future regression must check `uq_biz_property_approval_request_active_source_v2_build` before and after each fault boundary.

## Required forward-only approach

Do not edit `000197`, its checksum, its history rows, or any earlier applied migration. First create immutable evidence containing the *full* two observed PG16 hashes and the exact direct migration composition provenance. Independent database review must verify that the observations are from the frozen `000186`–`000195` chain and that no post-000195 writer changed the index.

Only after that review, reserve a new migration number after `000197`. That new forward migration must be idempotent only with respect to a database already in the old `000197` failure state: it must validate both history tables, the actual old catalog hashes, the intended `_v2_build` residue absence, and active-row uniqueness; it must not silently accept unknown catalog states. The corrected preflight must accept the attested PG16 old hashes and retain the same new-index hash/predicate assertions after replacement. It needs an explicit failure/recovery plan for a crash between build, drop, and rename, rather than modifying `000197`.

No source migration edit is authorized by this candidate. Any proposal to modify source migration text, including an unapplied successor, requires a new independent design, database, and QA/security review before execution.

## Gates before any new resource

1. Immutable full-hash/provenance attestation, separately reviewed by database and QA/security.
2. New forward-migration design review covering history compatibility, lock/timeout behavior, exact build-residue handling and reversal/failure states.
3. Drain review for old writers and independently signed resource authority for a new runId/container/anonymous volume. It must not reuse G/H, v4, production, shared, or A–F resources.
4. Only then: a new runner that treats each injected `P0001` as expected, snapshots both histories/index/predicate/row count and checks the `_v2_build` residue after rollback.

This candidate makes no pass claim and cannot authorize `000197`, a replacement migration, approval testing, or cleanup.
