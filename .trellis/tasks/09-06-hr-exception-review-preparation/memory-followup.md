# Private full-freeze memory follow-up

Single-owner policy PR #658 merged as 4045fb817d3efac842390a86ecc4490a435908d8.
PR CI, main CI and automatic production deployment succeeded. Independent runtime
image observation 34009901472 matched API and Web to that commit. Read-only target
inventory 34009922617 validated 16 tables and the same 19 metadata records, target
identity and scope. Docker cleanup start/finish were both observed, without a skip.

Private current-code candidate preparation completed: 260,828 records, 260,781 insert,
47 quarantine, zero skip/collision. Historical semantic packages and the immutable
source manifest were verified and reused; no source extraction or A/B was rerun.
All 47 previous nonempty quarantine projections match the new candidate source-row
identities and reasons. Real operator/encryption keys were reused, not reset.

Initial exception prepare hit the 2 GiB RSS guard. A bounded 768 MiB old-space run
completed encryption preparation with sampled peak RSS 1,443,627,008 bytes, but
delegated full freeze exited without a completion receipt. Do not claim signatures,
one-time authorization, sealed plan, production import or business UAT succeeded.
Preserve all private files outside Git, including failed attempts.

The next narrow code change removes redundant copies of privately parsed graphs
inside the real-artifact bridge. No schema, mapping, role, activation, crypto, writer,
workflow or dependency change is intended. Preserve exact byte and payload hashes,
caller isolation, fatal UTF-8 validation, and reject shared backing memory. Regression
tests cover those boundaries. Real-data memory verification remains required; this
patch alone does not close the production execution gate. Do not ask for the already
accepted single accountable owner confirmation again.

Fetch before this repair found main advanced to f09783b9 by unrelated archived task
and team journal changes only. Branch codex/hr-freeze-memory-v1 starts from that main;
the previous 4045 material-preparation and d889 implementation branches remain intact.
