# B2c 000197 v11-v6 direct-PG regression v7 handoff

Status: `SEALED-AWAITING-DB-QA-DRAIN-RESOURCE`. v7 is a fresh successor to the returned v6 candidate. It did not create, inspect, execute, clean, or otherwise access Docker/PostgreSQL resources.

The sealed intake executes before creating an evidence directory or calling Docker. It requires immutable SHA-verified DB, QA/security, drain and resource authority files; the second and third review bind the preceding review SHAs. The resource authority must bind a new v7 runId, full container ID, database, full anonymous volume ID and pinned PostgreSQL `16-alpine` image ID. It rejects host ports, non-volume or read-only mounts, any prior-target reuse declaration, and shared/production/preliminary/isolated naming.

Spawn results are normalized from either `Buffer` or strings as UTF-8 before matching/persisting. Every psql call sets `ON_ERROR_STOP=1` and `VERBOSITY=verbose`. Each injected boundary must return nonzero `ERROR: P0001:` with its exact marker; the runner records no retry or cleanup.

The structured snapshot proves both histories' exact succeeded rows/checksums for `000185`–`000190` and `000193`–`000195`, absence of `000191`/`000192`/`000197`, zero approval rows, all six active-source key names, the `89d630…`/`d47740…` old hashes, and false `uq_biz_property_approval_request_active_source_v2_build` residue before and after each fault. The old state is built only from the 194-file direct PG16 migration inventory; `pg_dump` is never accepted.
