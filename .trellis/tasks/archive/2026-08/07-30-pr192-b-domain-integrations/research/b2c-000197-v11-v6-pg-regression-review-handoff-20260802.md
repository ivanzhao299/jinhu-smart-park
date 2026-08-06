# B2c 000197 v11-v6 isolated PostgreSQL regression review handoff

Status: static candidate only. Execution is not authorized.

The failure-boundary build index is now sourced directly from the frozen `000197` migration. A statement-bounded token parser verifies the exact six columns, active decision/execution predicate, build/final index names and catalog hashes. The fixture contains neither `source_domain` nor the legacy `action` column.

The isolated runner has no fixed A–H target. A later, separately authorized run must inject a new dedicated PostgreSQL 16 container, anonymous volume, database, unique run ID, and a canonical old-baseline SQL path/SHA through the eight keys listed in the candidate authority. It loads the baseline once, executes only the four rollback fault transactions, requires one unique `P0001` marker per boundary, and proves exact before/after/final snapshots with no build residue. It neither runs migration `000197` nor approval setup/cleanup.

Static verification passed on Node 22.23.2 and Node 24.18.1: DDL contract 5/5 and runner 5/5 on each runtime. ESLint passed. No Docker or database command was executed.

Independent database and QA reviewers must bind the candidate authority, manifest, test record and this handoff before any temporary container may be created or used.
