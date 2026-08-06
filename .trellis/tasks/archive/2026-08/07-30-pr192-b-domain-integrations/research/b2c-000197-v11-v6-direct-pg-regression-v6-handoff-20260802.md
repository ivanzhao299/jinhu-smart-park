# B2c 000197 v11-v6 direct-PG regression v6 handoff

Status: `SEALED-AWAITING-NEW-INDEPENDENT-REVIEWS`. This is static code and evidence only: it did not create, inspect, run, clean, or otherwise access Docker or PostgreSQL resources.

The runner constructs the old `000195` state by supplying each frozen migration/seed byte sequence directly to PostgreSQL 16 via psql stdin. It accepts neither a `pg_dump` file nor generated replacement SQL. Its 194-file canonical provenance inventory hashes to `db61fdb7bb73addce319f680b2f38d2e0aa41fccd5b3a73cbd131a04bd81bcfc`; the eligible sequence excludes `000175`, `000191`, `000192`, and `000197`, while it records succeeded dual-history rows for `000185`–`000190` and `000193`–`000195`.

The baseline assertion consumes the verified old values from `000197`: index definition `89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584` and predicate `d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37`. The rollback snapshot now checks the actual transient build identifier `uq_biz_property_approval_request_active_source_v2_build`, not the obsolete `_v4_build` spelling. Each injected boundary must return exactly `P0001` with its expected marker, followed by an exact pre/post snapshot equality check.

Before a real candidate may exist, independent DB, QA/security, and old-writer drain review must independently bind the final runner/spec/static evidence and issue fresh GO artifacts. A later resource authority must name a brand-new runId, PG16 container/full ID, database and anonymous volume with no host port; no production, shared, A–F, G/H, or prior v4 resource may be used. The runner makes one attempt only and records no cleanup. `000197` is not modified by this work.
