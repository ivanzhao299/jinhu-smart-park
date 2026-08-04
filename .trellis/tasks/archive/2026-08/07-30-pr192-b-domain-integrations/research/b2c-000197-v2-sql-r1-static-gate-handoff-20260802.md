# B-2c 000197 v2 SQL, R1 and Static Gate Handoff

Date: 2026-08-02

Status: **V2 STATIC CANDIDATE / LIVE EXECUTION BLOCKED**

Owner: `b2c-unique-schema-migration-owner`

Run ID: `b2c197_r0_20260802a`

## Current immutable chain

| Artifact | Bytes | Raw SHA256 |
|---|---:|---|
| R0 reservation grammar | 5227 | `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439` |
| v2 SQL | 10515 | `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059` |
| R1 v2 checksum seal | 1172 | `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b` |
| v2 gate runner | 14402 | `ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c` |
| v2 executable static spec | 8962 | `400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170` |
| v2 gate input manifest | 2394 | `973566353ad804ee653ebc2f129146d3191a6a9d34783d84721ea095f643a151` |

The original R0 grammar and explanatory document were not edited. The original R1 and
v1 candidate are retained only through the separate RETURNED disposition.

## Closed return findings

1. SQL and runner inspect the complete `^000197_` prefix. Only dual absence or one exact
   filename in both stores can proceed. Unknown rows, duplicates, single-sided rows,
   checksum/status mismatch, running, unknown status, exact plus unknown and multiple
   unknown rows all fail closed.
2. The history matrix is executed as unit code, not inferred by regex. Exact dual
   succeeded is skip-and-verify. Failed exact checksum cannot retry without a direct,
   non-symlink research artifact and a lowercase 64-character raw SHA that recomputes.
3. A failed-retry artifact must bind the exact run ID, R0, R1, SQL, reviewer authority,
   `GO`, corrected-catalog decision and full target identity. Arbitrary nonempty values
   fail.
4. Each target is bound to full container ID, name, database, anonymous volume, image
   ID, image tag, running state and PostgreSQL 16.14. Same-name replacement fails.
5. Every pre-run re-scans the frozen worktree list and all worktree `000197_*` files.
   The only authorized entry is the v2 SQL at its exact path, byte count and SHA.
6. The v2 manifest is self-checked for SQL, R0, R1, plan, runner, executable spec,
   worktree digests and both resource identities.

## Validation

- Node syntax checks: PASS.
- Executable static matrix: 8 tests PASS.
- v2 static mode including manifest/hash/worktree scan: PASS.
- v2 read-only A/B resource and full-prefix history preflight: PASS.
- A history decision: `dual-absent/execute`.
- B history decision: `dual-absent/execute`.
- SQL execution/database writes: NOT RUN.
- Container or volume cleanup: NOT RUN.

## Fixed DAG and remaining boundaries

Two independent v2 reviewers must return `P0/P1/P2=0` before the live lock may be
changed. After that approval, only the A/B absent-path preliminary `000197` execution is
eligible. It is not the final PostgreSQL Gate and does not publish a current approval
runtime handoff.

At least target A must be retained after preliminary execution for the `197-first`, then
real `000191/000192` later-apply proof. Once both effect migrations exist, the owner must
run present-before, final fresh lexical and later-apply paths plus the remaining dynamic
section 10 scenarios. Until then, cases 1, 3 and 14 and the final/current handoff remain
explicitly deferred. No synthetic history or no-op effect migration may close them.

```text
GO: submit v2 bytes for two independent reviews.
NO GO: execute 000197 before both v2 reviews pass.
NO GO: claim final/fresh/present-before/later-apply/current completion.
```
