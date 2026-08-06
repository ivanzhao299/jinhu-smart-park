# B-2c Current Authority Locator v2

Date: 2026-08-03

Status: **CURRENT / INPUT FREEZE / 000191+000192 RESERVATION NOT YET RECORDED**

This locator supersedes `b2c-current-authority-locator-v1.md` with raw SHA-256
`1361d87978cd0bc8656e7d3243de808db8c634b9049c57184ab49a959a71fa56`.
Historical locators and authorities remain immutable and retain audit value.

## Current-only authorities

| Authority | Current SHA-256 |
| --- | --- |
| B-contract-v2 | `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944` |
| Runtime effect parent authority | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| Product/access parent authority | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| Parent contract current freeze | `671ebcc86c9c49a6f6f9dbf2818ee1646c3a814a4b3d3329cfa09bbb6f705f10` |
| Selected 000191/000192 authority amendment v2 | `a0e3c6c7e21fef7886ebaab82a9e1f44c57c4c7f6146160e706168769f996e55` |
| Selected-authority promotion handoff v2 | `0306850ad9518af5cf0f74d5e7eacde477b822caa4239400fadda2f81e574433` |
| Trusted signer directory | `1def01678363119d76ff7dbbb643a2a90629a0776e8e803ab714851995836074` |
| Complete decision record | `ca2501a03f548e01f7df68cbf46e4e3df10e404d00f92337f90f61beff776016` |
| B-schema-expand | `53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874` |
| B-property-foundation-runtime-v2 | `984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4` |
| B-approval-runtime-v2 sidecar | `30168511b4ea2028afebf45300a399dcb3f0d15b6ed279368611447a61f1f589` |
| B-property-task-runtime | `f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645` |
| B-module-core | `988eb7e5f70bc5e0614e700feaf77ea68d0edc1f1edcb90aa57ab5b4a3b193df` |
| B-extension-core fixture | `5c7f679497f2b7e6f586b74e3c0767d8377bdf05dcc5aeabd6111ce5d325ca56` |
| B-extension-core validation | `9470a733f65b85efab9461f7abab0697106765527cbb7cce5858f889f3239abe` |
| 000197 v31 execution authority | `5d72c08ff5b4324b7477b7e61dbe6b119557370fd2c0c3258b42404cf76648bf` |
| 000197 v31 terminal success | `8b0a8755b4c5f3fba826ef0d62b2d1a6e5716f72c9457c8f90610d75cce9c0a4` |
| 000197 v31 evidence manifest | `d7c1ea328db43f3db05365df6f9f7e6b3e49ed5d7b9382ebfc287f33e911fad7` |

The selected amendment is read together with the parent authorities. Where it lists an
exact replacement subject, the amendment wins; all other parent rules remain current.
Superseded draft hashes and every failed 000197 run remain audit-only inputs.

## Canonical migration identities

- `000191_property_b_homestay_effect_schema.sql`
- `000192_property_b_housing_effect_schema.sql`

These identities are approved but are not reserved merely by appearing here. The only
accepted reservation is a later immutable artifact produced from a fresh filesystem,
all-worktree, and dual-history scan after this locator is frozen.

## Consumption boundary

Before a migration file is created, the unique schema-migration owner must bind this
locator's raw SHA, the promotion handoff SHA, exact current repository/worktree scan,
and consistent absence in both `public.sys_schema_migration_history` and
`public.schema_migrations`. Collision, missing history authority, inconsistent stores,
or any `running`/`failed` history row fails closed.

Adapters remain blocked until both formal migration handoffs and the independently
verified property-foundation adapter handoff exist. This locator is not an adapter,
UAT, deployment, or production-enforcement approval.
