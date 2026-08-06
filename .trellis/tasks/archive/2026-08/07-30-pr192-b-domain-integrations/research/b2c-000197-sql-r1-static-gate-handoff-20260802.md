# B-2c 000197 SQL, R1 and Static Gate Handoff

Date: 2026-08-02

Status: **STATIC GO CANDIDATE / LIVE POSTGRESQL NOT RUN**

Owner: `b2c-unique-schema-migration-owner`

Run ID: `b2c197_r0_20260802a`

## Immutable chain

| Artifact | Bytes | Raw SHA256 |
|---|---:|---|
| R0 reservation grammar | 5227 | `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439` |
| `000197_property_approval_active_source_index_forward_fix.sql` | 9076 | `39148494abd2734df999be4fbfb3190beff81455d8035ff6ac4904490d5a8120` |
| R1 checksum seal | 1021 | `65acbccf71c91795602e7408930bdce44721acaafa503fa81d6f2506b8da1f36` |
| Gate input manifest | 1685 | `6926d42365dbe70f1627459cf66929818aceea61891e062b570bc11436ff48f1` |

R0 grammar and R0 explanatory document were not edited. R1 is a separate immutable
file that references the R0 raw SHA and exact migration bytes.

## Migration scope

The migration changes only
`public.uq_biz_property_approval_request_active_source`. It verifies exact dual-history
authority, takes `SHARE` lock before catalog/data inspection, accepts only the signed old
or signed new PostgreSQL 16 definition, validates six ordered keys with no INCLUDE or
constraint ownership, rejects active duplicates and illegal status pairs, then performs
the create-first/drop/rename swap in one transaction. Its postcheck requires the exact
new definition and no build-name residue.

The migration contains no homestay, housing, effect, receipt, task, outbox or application
change. It does not use concurrent DDL, `IF EXISTS`, `IF NOT EXISTS`, silent repair or a
changed timeout.

## Gate assets

- `scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs`
  implements the immutable R0/R1/file hash chain, exact run ID/resource binding and the
  fail-closed pre-run dual-history matrix.
- `scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs`
  statically verifies the chain, SQL order and forbidden constructs, authority/history
  guards, catalog hashes, predicate, runner matrix, resource boundary and all fifteen
  section 10 scenario registrations.
- Existing approval-port PostgreSQL suite and wrapper are frozen into the manifest for
  the application monotonicity/concurrency join Gate.

The runner defaults to `static-ready`; `B2C_000197_GATE_EXECUTE=1` is deliberately locked
until two independent reviewers sign the SQL/R1/static-gate candidate. The read-only
pre-run mode was executed against both authorized targets and returned
`dual-absent/execute` for each, with `candidate_admissible=false` and no database write.

## Validation

- Node static test: PASS.
- Runner static mode/hash-chain: PASS.
- Runner read-only dual-history preflight on A and B: PASS.
- `000197` PostgreSQL execution: NOT RUN by design.
- Database/container/volume mutation after R0: none.
- R0 raw SHA after implementation: unchanged.

## Required independent reviews and blockers

Two independent reviewers must recompute the SQL, R1 and manifest chain, inspect the
static Gate and return `P0/P1/P2=0` before any `000197` execution.

After those reviews, the formal PostgreSQL Gate must replace the runner's live lock only
through reviewed change control and publish immutable upgrade/fresh artifacts. It must
also join the existing approval-port PostgreSQL suite for terminal-version monotonicity,
concurrency and old-writer/new-writer evidence.

Plan section 10 cases 3 and 14 require the real `000191` and `000192` migrations to be
present and later applied. Those files do not yet exist by the approved DAG. The runner
registers both scenarios, but no synthetic migration or fabricated history is accepted
as closure. Their real full-chain evidence remains blocked until the two effect-schema
handoffs are delivered; this does not permit misreporting the current static candidate as
the final Track B migration Gate.

Current decision:

```text
GO: submit SQL/R1/static-gate bytes for two independent reviews.
NO GO: execute 000197 before both reviews pass.
NO GO: claim section 10 cases 3/14 or the final full-chain Gate complete.
```
