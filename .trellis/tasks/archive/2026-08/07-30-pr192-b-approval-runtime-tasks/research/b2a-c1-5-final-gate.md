# B-2a C1.5 independent final gate

> Date: 2026-08-01
>
> Verdict: `C1.5 FINAL GATE = PASS`

## Independent disposition

| Perspective | P0 | P1 | P2 | Verdict |
|---|---:|---:|---:|---|
| Architecture / database / hash chain | 0 | 0 | 0 | PASS |
| Product / RBAC / interaction contract | 0 | 0 | 0 | PASS |
| Test / security | 0 | 0 | 1 | PASS with named downstream gate |

```text
C1_5_open_P0_P1=[]
C1_5_final_gate=PASS
000195_release=allowed_schema_migration_owner_only
C3_release=blocked_until_000195_pass
C4_release=blocked_until_C3_pass
```

## Frozen reviewed inputs

| Input | SHA-256 / size |
|---|---|
| C3-0 plan | `c34124caee3846efc2b91fc0fc8a933edc75be9be0f3dd47f1d61ee26998873c` |
| current authority locator | `671ebcc86c9c49a6f6f9dbf2818ee1646c3a814a4b3d3329cfa09bbb6f705f10` |
| C1.5 owner handoff | `37afa61e54d9c84285c96d2f3b9674bb3ab9f7282df7dbea208f970b3d0db21f` |
| runtime freeze | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| B-contract | `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944` / 421 bytes |
| shared source | `d444a85ec6be5dcaf0cc0315fdab7aafdbf1493322a6df104930aaad226b633a` / 1,294 bytes |
| legacy manifest | `4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9` / 925 bytes |
| port-v2 manifest | `34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975` / 566 bytes |
| foundation s2 | `9852b7199a9e35bed54dc73c7e0a2f799a6082165c12a61e30ce83d6e5972075` / 2,460 bytes |
| foundation integration | `be2fe53d7f0349a2b68ec0867ef294b8ea9f769f48ca35d45ba797fa9182579b` / 5,635 bytes |
| foundation runtime v2 | `984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4` / 1,465 bytes |
| AppModule, unchanged | `225fbdfa17f7d2ec99f280d909cab057fc04b803c06fbf2ae378874707ef09fb` |

The old C1 current values remain immutable historical evidence and cannot authorize
000195 or later work.

## Validation results

- Shared build, test, lint and typecheck: PASS; 4/4 test files.
- API typecheck and build: PASS.
- Seven targeted approval/identity API specs: 7/7 PASS.
- Final bilateral writer specs: 2/2 PASS.
- Identity scan recursively covers all production TypeScript in the module: seven
  mutate callsites equal the signed subset, one receipt INSERT exists, and it is the
  explicit `legacy-v1` service writer.
- Approval scan covers the complete module: four ORM and two SQL writers equal the
  signed subset and are explicit `legacy-v1`.
- Manifest/hash recomputation and scoped diff-check: PASS.
- No Docker/PostgreSQL was run. C1.5 is a pre-migration contract/static gate and the
  signed rollout is DB-first.

## Mandatory downstream P2

The current non-database evidence does not claim a pre-C1.5 byte-for-byte database
replay proof for all thirteen legacy actions. This is a named mandatory gate:

1. 000195 must run old-app/new-schema PostgreSQL compatibility cases for all signed
   legacy lifecycle shapes without changing stored requestHash/resultHash/resultRef.
2. C3 must run the complete B1/foundation regression and compare the thirteen action
   request/result/ref goldens before and after port installation.

Failure of either item blocks C3/C4 and returns to C1.5; it does not permit relabeling
historical bytes as already proven.

## Release boundary

Only the unique schema migration owner may now perform the dual history/worktree scan,
formally reserve and create `000195_property_mutation_receipt_contract_v2.sql`, then run
its independent unique-run temporary PostgreSQL gate. This PASS does not approve the
migration result, receipt port, task runtime, Track B, Track C, UAT or production.
