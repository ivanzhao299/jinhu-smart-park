# B-0 current contract freeze authority

> Date: 2026-08-01
>
> Authority version: `C1.5`
>
> Status: `CURRENT REVIEW INPUT / IMPLEMENTATION RELEASE BLOCKED`

This file is the single current-authority locator for Track B contract consumers. The
historical `b0-contract-freeze-manifest.md` and `b2a-c1-final-gate.md` remain immutable
evidence for the superseded C1 contract; their historical hashes must not be edited or
used to authorize 000195/C3/C4.

| Current input | SHA-256 |
|---|---|
| `b0-runtime-contract-freeze.md` | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| `b0-product-access-freeze.md` | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| `b0-identity-control-freeze.md` | `062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496` |
| `b0-schema-physical-addendum.md` | `3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5` |
| `b-contract-v2` grammar (421 bytes) | `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944` |
| `b-shared-source-v1` grammar | `d444a85ec6be5dcaf0cc0315fdab7aafdbf1493322a6df104930aaad226b633a` |
| endpoint manifest, re-attested | `6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd` |
| error filter, re-attested | `ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0` |
| legacy action authority | `4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9` |
| port-v2 action/identity/mode | `34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975` |
| foundation runtime v2 candidate | `984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4` |
| AppModule raw, unchanged | `225fbdfa17f7d2ec99f280d909cab057fc04b803c06fbf2ae378874707ef09fb` |

Superseded current-authority values:

```text
runtime raw = 1c61c425b709b4155423d6fff1a39ce778e995ff96aef41135df2c410b15b27d
B-contract SHA = 81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3
B-shared-source SHA = b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a
B-property-foundation-runtime SHA = 19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a
```

```text
C1_5_independent_gate=pending
000195_release=blocked
C3_release=blocked
C4_release=blocked
```
