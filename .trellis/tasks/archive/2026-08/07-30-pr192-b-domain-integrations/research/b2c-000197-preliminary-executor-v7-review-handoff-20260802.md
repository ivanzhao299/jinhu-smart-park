# B2c 000197 preliminary executor v7 review handoff

Status: frozen candidate awaiting two new independent v7 GO reviews and one new
old-writer drain v7 GO. This handoff does not authorize live execution.

## Frozen chain

- Logical formal run ID: `b2c197_prelim_20260802c`
- Fixture run ID: `4fce75ade89881fb1079f88f3a1e46ab`
- SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- R0: `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
- R1: `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b`
- Approval runtime v8: `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Failure cases v7: `ad0e0ddb70cc894d0c58686f1c15038521dc099cf67a66ac329c2aa0ddd8269c`
- Executor v7: `869859d5d09ef6b5089f45e7d70514e6043b460c47e63f5d2d3ce36572c5848a`
- Orchestrator v7: `a10557c9019248108bae51c810ef6b5729adea40e5faf2af9b42c343103dd100`
- Executor spec: `165a01c7e3c9cdd197c627150244a077a6388e1b83a1a9ccee366c939ee4a483`
- Orchestrator spec: `4e6640a8b430920b88b97db47e5e0c01efcbda41ea75264bdde7ee6f7e3e5b57`
- Capability closure spec: `58d086afc050b1289a48319caea1898d4de1bb1ba16b349ebd45f2a14eec31da`
- Frozen closure spec: `3f8f75965bc72fe250efbc28e7471304b13e83e58ca3b4d1862f93fd9fb04934`
- Input manifest, 6269 bytes: `ec7fbfe789c8763b3524bbaa365ac32d01b58064f83a6a2372fc55a9eea8a2e7`

Any byte, size, symlink, prefix, resource identity or manifest-row drift returns
this candidate to review.

## Executable capability closure

The guarded formal entry retains the complete live flow: exact input and resource
authority checks; two independent reviews plus a new drain; dual-history
`running` to SQL to `succeeded`/`failed`; migration apply and byte-identical rerun;
the exact 12 status pairs with seven active and five terminal outcomes; active
same-source duplicate conflict `23505`; terminal same-source count two; four
independent rollback/residue fault boundaries on both C and D; and approval v8
compile, connect, setup, exact named seven tests, cleanup and independent after
postcheck in `finally`.

All child intents, results, parse records, success/failure terminals and manifests
use exclusive `wx` writes and mode `0444`. Secret discovery occurs before every
immutable write, while benign argv is retained only in `intent.argv` and does not
pollute captured TAP stdout/stderr.

## Complete read-only C/D preflight

The complete v7 read-only preflight passed on the exact retained C and D
container/image/database/volume identities. Both targets reported:

- no host port bindings;
- primary and mirror `000191`, `000192` and `000197` counts equal zero;
- primary and mirror running/failed counts equal zero;
- other clients, open transactions and approval-create writers equal zero;
- approval rows equal zero, exact old index/predicate and no build residue.

Evidence:

- artifact, 3204 bytes: `096c841a0d5ad40c7eb7757a4307016003f279e65160208c7ff63a405fc4f908`
- manifest, 379 bytes: `8ea527547bc23e0cf8a231ec50b56e82d5792bb70811745ecc0e277bdb21eb69`

The earlier shorter v7 preflight evidence is audit-only and is not an authority
input. C and D remain retained and unchanged.

## Required authority and deferred scope

New reviews must use schema
`b2c-000197-preliminary-v7-independent-review-v1`, bind this handoff, the exact
input manifest, resource authority, executor and orchestrator hashes, and identify
the distinct database and QA/security reviewer authorities with `decision=GO`.

The new drain must use schema `b2c-000197-old-writer-drain-v7`, bind the same
logical run ID and resource authority, and prove `decision=GO`, stopped intake,
zero in-flight approval creates and writer build `approval-port-v8`.

The RETURNED v4 drain
`93fb2c36e3d44bfa32cb88e1a2c36489ae216371fa3335c3d18b0c702b58fa1a`
is narrative audit history only and is not read, imported, statted, spawned or
listed as an input-manifest file row. No v7 review or drain artifact is created by
this handoff. Final/current and later `000191`/`000192` scenarios remain deferred;
`final_current=false` and live execution remains blocked.
