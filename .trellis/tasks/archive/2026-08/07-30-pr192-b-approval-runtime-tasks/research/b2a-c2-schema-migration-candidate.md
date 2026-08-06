# B-2a C2 Schema Migration Candidate Evidence v12 Template

> Date: 2026-08-01
>
> Status: `FULL-C FAILED / NEXT FULL-D NOT RUN / NOT SIGNABLE`

This document is the implementation-owner template for the next full v12 run. It is not a C2 signoff, does not self-sign any review, and does not convert the targeted diagnostic result into candidate evidence.

## Frozen implementation inputs

- `000194` raw SHA-256: `93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0`
- v12d runner raw SHA-256: `98e4c4719ab802e14f1e93c81af14e4f59c526981f1258334f1516b128079dcf`
- v12d static contract test raw SHA-256: `5f0be48e3aee41aaf5b71883b856137c20106a8f29958e90caab59433e273df2`
- Signed budget digest: `d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45`
- Corrected B-contract SHA-256: `81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3`

Any change to the migration, runner, or static test invalidates these values and requires this template to be refreshed before the full run.

## Previous failed full diagnostic

The immutable path `b2a-c2-candidate-gate-artifact-v12.json` contains the failed full-run diagnostic. Its first failure was action `property.task.rebuild`, warm-up ordinal 1, before any action completed: the budget child referenced undefined `connectionTimeoutMillis` while constructing the PostgreSQL client. The run retained two-million-row stage output, recorded zero executed actions, materialized no sidecars, and cleaned the exact container, anonymous volume, and temporary targets. It is `FAILED`, not candidate evidence, and must not be overwritten.

## Full-b independent review return

Run `b2ac2_v12_full_20260801b` completed its implementation gate and cleanup, but independent test/security review returned it with `P0=0`, `P1=2`, and `P2=2`. Its immutable main artifact and detached files under the `b2a-c2-candidate-gate-artifact-v12b.json` prefix remain historical returned evidence and must not be overwritten or described as signed.

The returned findings require real blocking-operation timeout values at attempt top level, deadline-derived forced-lock timeouts and evidence, database-instrumented negative access counts, and an explicit C4 winner-reread normalization obligation for raw absent-head `23505`.

## Full-c failed diagnostic

Run `b2ac2_v12_full_20260801c` completed its business gates but ended `failed` because the immediate cleanup inspection still saw the exact container. Its immutable `b2a-c2-candidate-gate-artifact-v12c.json` records `container_absent=false`, `anonymous_volume_absent=true`, no sidecars, and a cleanup P1 finding. Later independent Docker inspection found the exact ID absent and no remaining container or volume, which diagnoses an asynchronous removal visibility race but does not retroactively change the run to PASS. The v12c artifact must not be overwritten.

## Safe next full-run artifact path

The reserved main path is:

```text
.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-candidate-gate-artifact-v12d.json
```

The path is currently absent. The runner uses exclusive creation and may create it only for a full run with `B2A_C2_TARGETED_V11` omitted. The five sidecars, watchdog evidence, and detached manifest must use the same main-path prefix. A failed full run may create only a failed main diagnostic artifact; it must not be described as candidate PASS.

Prepared command template, not executed by this update:

```text
PROPERTY_B2A_C2_RUN_ID=<new-unique-full-v12d-run-id> PROPERTY_B2A_C2_ARTIFACT_PATH=.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-candidate-gate-artifact-v12d.json /home/jinhuit/.nvm/versions/node/v22.23.2/bin/node scripts/e2e/property-remediation/track-b2a-c2-schema-gate.mjs
```

## Full-run acceptance boundary

The full run must execute, not skip, the watchdog injection, all signed action measurements, the two-million-row performance gate, sidecar materialization, detached hash-chain validation, and cleanup. It must also retain the fresh normal reservation path and all four independent database-history negative injections before applying `000194`.

Only a newly materialized raw artifact and its detached files may supply full-run timings, PostgreSQL evidence, hashes, findings, and cleanup records. No such values are prewritten here.

## Review boundary

```text
review.architecture_database = pending
review.test_security = pending
review.product_rbac_interaction = pending
review.open_p0_p1 = not_computed
candidate_gate = NOT_RUN
C2_release = blocked
```

The prior v10 artifacts remain historical evidence and are not v12 inputs or substitutes.
