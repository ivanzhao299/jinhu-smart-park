# B-2a C3-0 pre-signoff

> Date: 2026-08-01
>
> Verdict: `C3-0 ACCEPTED / C1.5 RELEASED`

## Signed inputs

| Input | Raw SHA-256 | Bytes |
|---|---|---:|
| `legacy-action-authority-v1.txt` | `4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9` | 925 |
| `port-v2-action-identity-mode-v1.txt` | `34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975` | 566 |
| `b2a-c3-0-receipt-contract-correction-plan.md` before embedded-hash update | `b3be909513c8dce81b62430db00cace9b713fdfac7cb2f1eda4a395828ec13a0` | 7817 |

The plan row above records the exact reviewer input. The plan was then changed only to
embed the two accepted manifest hashes and clarify that migration reservation remains
candidate-only until C1.5 PASS. Its post-sign raw hash is recorded below and is the
authoritative implementation input.

```text
authoritative_plan_raw_sha = c34124caee3846efc2b91fc0fc8a933edc75be9be0f3dd47f1d61ee26998873c
authoritative_plan_bytes = 8147
```

## Independent review disposition

| Perspective | P0 | P1 | Verdict |
|---|---:|---:|---|
| Product / RBAC / contract | 0 | 0 | ACCEPTED |
| Architecture / database | 0 | 0 | ACCEPTED |
| Test / security | 0 | 0 | ACCEPTED |

Non-blocking items remain mandatory at their named gates: exact legacy/task static
manifests, Unicode and result-byte differential vectors, migration/control/race/cleanup
evidence, machine-verifiable B4 rollout telemetry, and the 000196 default-drop gate.

```text
C3_0_open_P0_P1=[]
C1_5_release=allowed
000195_release=blocked_until_C1_5_pass
C3_release=blocked_until_000195_pass
C4_release=blocked_until_C3_pass
```
