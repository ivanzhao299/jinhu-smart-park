# B2c 000197 preliminary v4 evidence change request

Status: implementation candidate / unfrozen / no execution authority.

Run ID candidate: `b2c197_prelim_20260802c`.

The frozen v3 executor, orchestrator, manifest, handoff and any drain/review
artifacts are RETURNED audit-only inputs. They must not be changed or accepted
as v4 authority. C/D remain dual-absent and may only be read until a separately
frozen v4 chain receives new independent authority.

## Required corrections

1. Discover secrets from process inputs before intent persistence and from
   child/inspect output in memory before result persistence. Redaction covers
   `POSTGRES_PASSWORD=`, PostgreSQL URL userinfo, secret-bearing environment
   objects/JSON and argv. Exact secrets must not occur in any immutable evidence.
2. Formal absent-state validation requires `approval_rows===0` in addition to
   dual-history absence and zero build residue.
3. The approval lifecycle must expose independently spawned compile, connect,
   setup/before, direct named-test, cleanup and after phases. Cleanup/after must
   be spawned in a finally path after any prior failure and its evidence must be
   persisted before the primary failure is surfaced.
4. Parser validation must consume real spawned process output for the internal
   five-test fixture contract and the future exact-seven PostgreSQL contract;
   synthetic TAP-only checks are insufficient.

The generic v4 evidence and phase engine may be implemented and tested now.
Resource manifest, freeze and GO artifacts remain blocked until the approval
owner supplies stable v6 external lifecycle CLI/spec paths and raw SHAs.
