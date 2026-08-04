# B-2a C3-0 receipt contract correction plan

> Date: 2026-08-01
>
> Status: `PRE-SIGN REVIEW ACCEPTED / C1.5 ONLY RELEASED`

## 1. Reason for correction

The signed C3 contract required every existing B1 receipt to use one port, while the
legacy rows do not persist a task identity or result version and their historical hash
bytes cannot be changed. C3 therefore uses an explicit compatibility split instead of
inventing data: signed legacy writers keep their existing bytes, and all property-task
commands use the versioned port.

## 2. Authority and action manifests

- `approval-runtime-owner` exclusively owns the six signed approval/event/notification
  `legacy-v1` actions.
- `property-foundation-identity-owner` exclusively owns the seven signed identity
  `legacy-v1` actions.
- `approval-runtime-owner` provides and exports `PROPERTY_MUTATION_RECEIPT_PORT` from
  `PropertyApprovalModule`; property-task code may only inject the port.
- The port exclusively owns the eight signed `port-v2` property-task actions. No other
  module may directly read or write their receipt lifecycle.
- The exact row sets are the adjacent canonical manifests
  `legacy-action-authority-v1.txt` and `port-v2-action-identity-mode-v1.txt`. C1.5,
  000195 and C3 must consume their raw SHA-256 values. Missing, extra or duplicated
  rows fail closed. A ninth task action or a fourteenth legacy action requires re-sign.

```text
legacy-action-authority-v1 SHA = 4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9
port-v2-action-identity-mode-v1 SHA = 34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975
```

No route, endpoint, menu, permission or authorization alternative changes. The port is
an internal transaction/idempotency capability, not an authorization boundary.

## 3. C1.5 shared contract

`PropertyTaskMutationIdentity` is the closed union:

```ts
type PropertyTaskMutationIdentity =
  | { tag: "property-task"; businessOccurrenceKey: string; taskKey: string }
  | { tag: "property-task-source-rebuild"; sourceType: string; sourceId: string };
```

The first branch is allowed only for claim/start/block/unblock/release and the two
source-terminal actions. Rebuild uses only the second branch and requires
`targetId === sourceId`. General, empty, constant, first-row and sentinel identities
are forbidden. Acquire and complete carry the literal `contractVersion: "port-v2"`.

Canonical occurrence validation requires at least one character other than U+0020,
rejects TAB/LF/CR/NUL/U+FFFD and lone surrogates, preserves NFC/NFD bytes, and accepts
1..256 UTF-8 bytes. JavaScript must not use `trim()` because its whitespace set differs
from PostgreSQL `btrim`. Persisted result versions are integers 1..2147483647; overflow
is rejected as `property-validation-failed` before SQL.

The result bytes remain:

```text
property-mutation-result-v1\n
<actionId><TAB><lowercase target UUID><TAB><identityTag><TAB><resultRef><TAB><resultVersion>\n
```

Item identityTag remains
`property-task:<taskKey>:<occurrence UTF-8 byte length>:<occurrence>`. Rebuild uses
`property-task-source-rebuild:<sourceType UTF-8 byte length>:<sourceType>:<lowercase sourceId>`.

## 4. 000195 database contract

The only C3 schema migration is the forward migration
`000195_property_mutation_receipt_contract_v2.sql`. It adds:

- `receipt_contract_version varchar(16) NOT NULL DEFAULT 'legacy-v1'`;
- nullable `identity_kind`, `business_occurrence_key`, `task_key`,
  `identity_source_type` and `result_version` columns.

Legacy rows keep request/result hashes and refs byte-for-byte. For `legacy-v1`, all five
identity/result-version extension columns are NULL. For `port-v2`, mutually exclusive
CHECK branches bind the seven item actions to occurrence/taskKey and rebuild to
sourceType/targetId. The database rejects legacy actions marked v2, task actions marked
legacy, and any unknown historical action during migration preflight.

The hash dispatcher is `CALLED ON NULL INPUT`, validates required/forbidden fields per
identity branch without coalescing or sentinels, fixes `search_path=pg_catalog`, and
calls `public.digest(pg_catalog.convert_to(..., 'UTF8'), 'sha256')`. Preflight requires
pgcrypto in `public`. The helper and trigger are SECURITY INVOKER, revoke PUBLIC,
grant CURRENT_USER, and have frozen definition hashes.

The unique guard objects are `fn_property_mutation_receipt_guard_v2()` and
`trg_property_mutation_receipt_guard_v2`. INSERT permits only started receipts with all
outcome fields NULL. Legacy permits started to completed or failed; v2 permits only one
started to completed transition. A started row may receive an exact no-op update;
completed/failed rows reject every update, including no-op. All versions and states
reject DELETE. Immutable columns are id, tenant_id, park_id, actor_id, action_id,
target_id, client_key, request_hash, receipt_contract_version, identity_kind,
business_occurrence_key, task_key, identity_source_type and created_at. Violations use
closed SQLSTATE 23514 messages. Valid port input that encounters an invariant failure is
translated outside the transaction to retryable `property-runtime-unavailable`; invalid
input is rejected before SQL.

Acquire uses `INSERT ... ON CONFLICT ON CONSTRAINT
uq_biz_property_mutation_receipt_client DO NOTHING RETURNING`. A loser locks the winner
by the full unchanged unique key before classifying version, identity, hash and status.
Cross-version or identity/hash mismatch is 409 `idempotency-key-conflict`; started or
defensive failed reads are 503. Replay rebuilds the result grammar exclusively from
stored identity/ref/version and compares the stored hash. Complete recomputes the hash
and performs a full-field started CAS; affected zero is retryable 503.

000195 first attests 000194 without masking drift, then replaces the existing
`fn_property_task_projection_replace_v1` with the same signature and no overload. While
the receipt is started, stored outcomes must be NULL; the function validates port-v2
identity and parameter result bytes, writes matching replacement audit, and the caller
then completes the same receipt in the same transaction. It also atomically migrates
disabled control rows from the C1 contract hash to C1.5 with one immutable audit per
row; mixed, enabled, shadow, enforce, missing or drifted states roll back everything.

## 5. Gate and rollout order

1. Record this plan, the two manifest hashes and dual history/worktree candidate
   reservation. The reservation becomes formal only when the unique migration owner
   creates 000195 after C1.5 PASS.
2. Re-sign B0 runtime input, recompute unchanged raw inputs, implement shared validation,
   and explicitly write `legacy-v1` in all thirteen legacy writers.
3. Pass independent C1.5 and full B0.5 foundation re-Gate; AppModule remains byte-identical
   and is independently re-attested.
4. Create 000195 and pass its unique-run temporary PostgreSQL gate, migration atomicity,
   control, Unicode/hash, transition, history, race and cleanup matrices.
5. Implement/export the port, re-attest B1, and pass the independent C3 gate.
6. Only then release C4.

The DB-first rollout keeps the legacy default only while old processes may still run.
B4 reserves `000196_property_mutation_receipt_contract_default_drop.sql`. Its execution
requires exact static writer manifests, deployed-instance version inventory, and a
machine-verifiable telemetry window proving no omitted version writes. 000196 only drops
the default and has its own preflight/rerun/history/rollback gate. Until it passes, the
default debt remains open and B5 is blocked.

## 6. Independent pre-sign disposition

| Perspective | P0 | P1 | Non-blocking follow-up | Verdict |
|---|---:|---:|---|---|
| Product / RBAC / contract | 0 | 0 | rollout default debt | ACCEPTED |
| Architecture / database | 0 | 0 | B4 telemetry precision; delete matrix evidence | ACCEPTED |
| Test / security | 0 | 0 | four gate-strengthening groups | ACCEPTED |

```text
C3_0_open_P0_P1=[]
C1_5_release=allowed
000195_release=blocked_until_C1_5_pass
C3_release=blocked_until_000195_pass
C4_release=blocked_until_C3_pass
```
