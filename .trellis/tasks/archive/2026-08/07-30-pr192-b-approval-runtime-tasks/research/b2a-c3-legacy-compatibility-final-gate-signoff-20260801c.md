# B-2a C3 legacy compatibility final gate signoff

- schemaVersion: `property-remediation-b2a-c3-legacy-compatibility-signoff-v1`
- status: `SIGNED`
- decision: `PASS`
- signature: `B2A_C3_LEGACY_COMPATIBILITY=SIGNED`
- signedAt: `2026-08-01`
- productionEnablement: `false`

## Signed formal evidence

- runId: `b2ac3_legacy_compat_formal_20260801c`
- artifact: `b2a-c3-legacy-compatibility-b2ac3_legacy_compat_formal_20260801c.json`
- artifact bytes / mode: `2638188` / `0600`
- artifact SHA-256: `2341ebc46bcce48a34058d65aeaf5d5325a5c07ddce5a4a19682fc4aa73a968f`
- detached manifest: `b2a-c3-legacy-compatibility-b2ac3_legacy_compat_formal_20260801c.manifest.txt`
- detached manifest SHA-256: `163874b99bb561495ef20b05450a1938ac7a74abb1e2a2ed3ae10cff1ebd4a98`
- reservation: `.b2a-c3-legacy-compatibility-runid-5f3c9b15972587d7be7fc3a77d0dcace9e3836fcdd9453ee3351b46c14c53dc7.reservation.json`
- reservation SHA-256: `c0a7743ac0073ac53d8d4e8abc1124b1a0ad313e4386315df6d5890ddb28bfa5`
- four-stage input freeze SHA-256: `6cfc542c3801fe8b85cee993343888bb9dfaf8ff974eae5b0b6ecbf53d250058`
- frozen input count per stage: `1191`

The artifact is `status=passed` and `candidate_admissible=true`. Artifact,
manifest and reservation path, byte count and SHA bindings were independently
recomputed. All four input-freeze file arrays and grammars are identical.

## Compatibility result

- immutable golden artifact SHA-256: `5dfd0e69ae6f5974d6c3f80ebd8160abbab066da4907a3d33aed24824d1281ba`
- canonical golden rows SHA-256: `3c2bd8a18ac4236a8db1e4eff583e9daec8c8aa4fac56e21011dee69ee5bd9ff`
- golden rows: `39`
- legacy actions: `13`
- statuses per action: `started / completed / failed`
- immutable fields per status: `requestHash / resultHash / resultRef`
- exact comparisons: `13 × 3 × 3 = 117 / 117 PASS`

Every comparison binds `expected`, `pre195`, `post_migration_pre_port` and
`post_port`; all four values are byte-for-byte equal, including null values.
This closes the mandatory downstream P2 named by the C1.5 final gate.

## Regression, migration and cleanup result

- local C3/B1/foundation specs: `38` files, `240/240 PASS`, `0 failed`, `0 skipped`
- shared property-task contract: `10/10 PASS`
- runner static safety contract: `13/13 PASS`
- PostgreSQL specs: `3` files, `23/23 PASS`, `0 failed`, `0 skipped`
- shared build, API typecheck/build, target/runner ESLint and diff-check: `PASS`
- dual migration history: primary and standard stores are identical; `9/9`
  signed migrations are `succeeded` with current raw checksums
- exact cleanup: `PASS`; the run-scoped container and anonymous volume are
  absent and cleanup errors are empty

## Independent review

| Perspective | P0 | P1 | P2 | Verdict |
|---|---:|---:|---:|---|
| Architecture / database / hash chain | 0 | 0 | 0 | GO |
| Test / security / compatibility matrix | 0 | 0 | 0 | GO |

## Historical evidence boundary

The failed formal attempts `b2ac3_legacy_compat_formal_20260801a` and
`b2ac3_legacy_compat_formal_20260801b` remain immutable failure evidence. They
were stopped during local gates before container creation and are not
relabelled or consumed as passing evidence by this signoff.

This signoff closes only the C1.5 mandatory legacy receipt compatibility gate.
It does not by itself close B-2a, release B-2b, enable production, approve UAT,
or waive the combined C1-C4 evidence review.
