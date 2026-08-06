# B-2c Current Authority Locator v3

Date: 2026-08-03

Status: **CURRENT / INPUT FREEZE / EFFECT-KIND ERRATUM APPLIED**

This locator supersedes `b2c-current-authority-locator-v2.md` with raw SHA-256
`93b660745a8be12397da7dacf0f153d7a744fa67aae1d34ac8621ddb7a80ce92`.
Historical locators and authorities remain immutable and retain audit value.

## Current authority delta

| Authority | Current SHA-256 |
| --- | --- |
| 000191/000192 selected-authority erratum v3 | `b3b3fa9c0d8d00cc827e5ce422368dfff399c59f91ce012207e4843fe9687e85` |

All current-only authority hashes listed by locator v2 remain current. The v3 erratum
wins only for the DEC-05 financial-effect machine identifier:
`housing.receivable.purchase.transfer`. The former
`housing.receivable.purchase-transfer` spelling is audit history and must not be
emitted or accepted by runtime code.

## Authority coverage

The trusted signer directory, issuer/evidence references, and explicit product,
finance, data, homestay-domain, housing-domain, and audit/security authorization are
signed and retained offline. The named delegated signer is `危立帅`. Private signature
material is not copied into the repository.

## Consumption boundary

This locator authorizes consumers to implement and verify the corrected exact
identifier. It does not waive migration, PostgreSQL concurrency, rollback,
authorization, browser, accessibility, UAT, deployment, or production-enforcement
gates. New schema fixes remain forward-only and require a fresh reservation and
history scan; already successful migration bytes remain immutable.
