# B2c 000197 preliminary executor v5 review handoff

Status: frozen candidate awaiting new independent database and QA/security GO
reviews plus a new drain v5 GO. No live execution is authorized.

## Frozen chain

- Logical formal run ID: `b2c197_prelim_20260802c`
- Physical resources: exact approved `20260802b`-labelled C/D IDs and volumes
- Fixture run ID: `4fce75ade89881fb1079f88f3a1e46ab`
- Approval runtime v8: `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Failure-case module: `b50ff2e3f9753f422cb25558e18c2fe947f71490f0d1c0ed32980e88f80845a2`
- Executor v5: `cabbacdc4f4c335eb30e463dd5c0a73e586130be1284016f89ee7454edcd9f3a`
- Executor spec: `27b683f0be61a34bec1428b8c299e25bc3cff728c99eee1c61d520af7b67f29b`
- Orchestrator v5: `b2271d3e26777b814b69c6ceee8d4f3ad7e63b15a25230f652837a7619b2fbb8`
- Orchestrator spec: `4599b81a8e38c6b8425eadfd3acfbf9299c766cd91cf7b6cb01c13e396160c66`
- Closure spec: `197cff6dc8884942d192f9f6c8b0596221fa9aa9cdd31c158f03ede5df806e0f`
- Input manifest, 5380 bytes: `8352e0a12105611615e68f0294f77e07337d071e8f92812d708b1b301c83d871`

Any drift returns the candidate to review.

## v5 corrections

All immutable writes recursively discover secret-bearing fields before
sanitization. Success and failure terminal payloads receive the same treatment
before artifact persistence. Executable positive and negative tests cover
terminal-only token, password, environment, argv and URL-userinfo secrets and
prove exact secret absence from every generated `0444` file.

Static validation has explicit `unfrozen` and `frozen` modes. Frozen mode
requires the manifest and handoff, validates every manifest file, and asserts
`manifest_frozen=true` with status `frozen-awaiting-independent-reviews`.

Every real Node test child declares `--test-reporter=tap`. Node 22.23.2 and
Node 24.18.1 independently passed the evidence 8, orchestrator 4, 000197
contract 8 and approval lifecycle 4 suites: 24/24 on each runtime. The v5
closure scan passed 3/3 on each runtime.

The v5 dependency closure imports no RETURNED v3/v4 executor/orchestrator and
does not import the old failure-case provider. Four failure definitions are
owned by the new v5 module and included in the manifest.

## Preflight and audit boundary

The v5 read-only C/D preflight passed with exact full identities, dual history
absence, numeric zero approval rows, exact old index/predicate signatures and
zero build residue:

- artifact: `e6eea12c4ccf878d7c848da6771a1c850142ba44e1d191b469a3c420c8e5c4e2`
- manifest: `381203fa10c484a02cbf054727cad3a425ac9554c0b174ddd575b0a542c58dc1`

The RETURNED v4 drain
`93fb2c36e3d44bfa32cb88e1a2c36489ae216371fa3335c3d18b0c702b58fa1a`
is audit-only and cannot satisfy v5 authority.

## Required authority

New reviews must use schema
`b2c-000197-preliminary-v5-independent-review-v1`, bind this handoff and the
manifest plus resource, executor and orchestrator SHAs, and identify the two
independent reviewer authorities with `decision=GO`.

The new drain must use schema `b2c-000197-old-writer-drain-v5`, bind the same
logical run ID and resource authority, and prove `decision=GO`, stopped intake,
zero in-flight creates and writer build `approval-port-v8`.

No review or drain artifact is created by this handoff. C/D remain retained and
unchanged; final/current scenarios remain deferred.
