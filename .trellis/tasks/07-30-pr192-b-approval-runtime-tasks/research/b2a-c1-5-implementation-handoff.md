# B-2a C1.5 implementation handoff

> Date: 2026-08-01
>
> Status: `IMPLEMENTATION COMPLETE / INDEPENDENT C1.5 GATE PENDING`

The single current-authority locator is
`.trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-contract-freeze-current.md`.
The old `b0-contract-freeze-manifest.md` is retained
unchanged only as historical C1 evidence and is explicitly superseded for every new
consumer.

## Contract chain

| Input | SHA-256 |
|---|---|
| C3-0 authoritative plan raw | `c34124caee3846efc2b91fc0fc8a933edc75be9be0f3dd47f1d61ee26998873c` |
| runtime freeze raw | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| product freeze raw | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| identity freeze raw | `062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496` |
| physical freeze raw | `3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5` |
| B-contract SHA | `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944` |
| legacy action manifest | `4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9` |
| port-v2 manifest | `34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975` |
| endpoint manifest, unchanged/re-attested | `6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd` |
| error filter, unchanged/re-attested | `ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0` |

The `b-contract-v2` grammar is 421 bytes and contains the four freeze rows in the
signed order. Only the runtime raw changed; the other three raw bytes remain identical.

## Shared source handoff

The existing `b-shared-source-v1` ten-file grammar remains unchanged. The two changed
raw inputs are:

```text
property-task-contracts.ts = d9383ef1cb5e9cc8aa16c1496fb9c72a0f8919dd6224d00c3b6bbef82a8497ae
track-b-contracts.ts = ad47c19635fbdf9a188853929183301df7ee9f48d94b139c3e26baddd6da6f51
B-shared-source SHA = d444a85ec6be5dcaf0cc0315fdab7aafdbf1493322a6df104930aaad226b633a
```

Shared build, test (4/4 files), lint and typecheck pass. Tests reproduce both canonical
manifest hashes, identity/result bytes, Unicode boundaries, version range and the
action/identity/mode matrix.

## Legacy writer and foundation handoff

The six approval/event/notification writers and seven identity writers now write the
literal `legacy-v1`. Static exact-set tests reject missing, extra or implicit writers.
Historical request hashes, result hashes, refs, replay and transaction behavior are
unchanged.

The recomputed B0.5 manifests are:

```text
candidate-s2 = 9852b7199a9e35bed54dc73c7e0a2f799a6082165c12a61e30ce83d6e5972075
candidate-s3 = 6c400535a31b2bf3024dba6a7b461e9ce23f89230843a9d4b1a8ce9b16294fcb
files-canonical = bd0b91aec02c728112f8a2304fd1b80f1d4e14fb45857c2815bb4e44198e78a9
candidate-integration = be2fe53d7f0349a2b68ec0867ef294b8ea9f769f48ca35d45ba797fa9182579b
```

The adjacent canonical `b-property-foundation-runtime-v2.txt` owner manifest is 1,465 bytes and hashes to
`984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4`.
It supersedes `19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a`,
consumes the new B-contract/shared/manifests, and records owner validation PASS with
independent review pending. AppModule raw remains exactly
`225fbdfa17f7d2ec99f280d909cab057fc04b803c06fbf2ae378874707ef09fb`.

## Validation

- Shared build/test/lint/typecheck: PASS.
- API typecheck and build: PASS.
- Seven targeted API spec files: 7/7 PASS.
- Approval static scan: exactly four ORM plus two SQL legacy writers.
- Identity static scan: exactly one SQL receipt writer covering seven signed actions.
- `git diff --check` on the C1.5 scope: PASS.
- Docker/PostgreSQL: intentionally not run. The new binary requires DB-first 000195;
  new-app/old-schema is explicitly unsupported and is not a C1.5 test target.

```text
owner_known_failures=[]
owner_open_P0_P1=[]
independent_C1_5_gate=pending
000195_release=blocked
C3_release=blocked
C4_release=blocked
```
