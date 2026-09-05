# Candidate preparation adapter

Reuse production-import-real-artifact-bridge and production-import-payload-generator; no second planner/writer/approval system. Add pure adapter plus private IO owner.

Authenticate byte descriptors for all phase/candidate files, rich inventory, scope, optional reviewed non-insert resolutions; distinguish raw byte hashes from canonical frozen hashes. Validate producer-specific envelopes, including T1 inventory alias and annotated dependency refs, T2/T3 T0 hashes and normalized T3 phase.

Join phase/candidate records one-to-one by complete provenance, preserving counts/zero tables. Construct allowlisted decisions. Insert-only candidates project automatically after recomputing model identity/dependency/content checks. Skip/merge/quarantine require explicit externally reviewed resolution bound to exact candidate artifact, source identity/row, triple/scope/inventory, fields and executable refs. Missing evidence yields no ready wrappers. Preserve rejected source reasons and original refs in retained preparation evidence. Never default collision to merge or lose records to obtain READY.

Quarantine targetFields null cannot pass to generator; reviewed resolution explicitly supplies partial fields and executable refs. Empty encrypted payload archives no original source fields; original candidate/source descriptors and exception evidence must remain bound and retained. Crypto metadata must reference real externally prepared envelopes. No fake attestation/ciphertext or claim that a hash verifies signatures.

Build existing frozen staging/inventory/scope/decisions and real wrappers, bind exact phase file SHA, call bridge. Persist preparation outputs and safe receipt, not final signed execution plan. Avoid needless clones or repeated bundle generation.

CLI --config only. Current clean tracked Git HEAD equals C. Canonical owned 0600 no-follow single-link files and 0700 private directories. Config <=1 MiB, small metadata <=32 MiB, large phase/candidate/decision <=384 MiB, total input <=1 GiB. Reuse existing bounded reader/chunked canonical serialization when compatible. Each output <=384 MiB, all outputs <=1 GiB; exclusive creation, fsync/readback, receipt last. Preserve partial artifacts; no broad cleanup. Tests may lower limits, never raise production caps. Actual real-scale memory remains separate measurement.

Production approval and activation contracts unchanged. Follow prior task research/candidate-freeze-wiring.md.
