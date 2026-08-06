# B-2c 000197 R0 Number Reservation Candidate

Date: 2026-08-02

Status: **CANDIDATE / AWAITING TWO INDEPENDENT R0 REVIEWS / SQL FORBIDDEN**

Owner: `b2c-unique-schema-migration-owner`

Run ID: `b2c197_r0_20260802a`

Candidate filename:
`000197_property_approval_active_source_index_forward_fix.sql`

Immutable raw reservation grammar:
`b2c-000197-r0-reservation-candidate-20260802.grammar`

Raw bytes: `5227`

Raw SHA256:
`705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`

## Decision

The unique schema owner completed the formal R0 preflight against repository HEAD
`0152616fb9a25effdff68fa9da24fea7db8a21a7` and two dedicated PostgreSQL 16.14 targets.
The evidence is sufficient to submit `000197` for two independent R0 reviews.

This document does **not** authorize SQL creation. R1 does not exist. The migration file
must remain absent until two independent reviewers recompute this raw grammar and return
GO with `P0/P1/P2=0`.

## Repository, worktree and retained-reservation result

- The current migration directory contains 194 SQL files. Its ordered file/checksum
  manifest SHA is `a79af5b1d84033d6ca9ce79ff53248235c86852fe63c91860f9774eb03842294`.
- All 15 registered worktrees were scanned. No `000191_*`, `000192_*`, `000196_*` or
  `000197_*` migration file exists in any worktree.
- Every local branch tree was scanned for the same four prefixes; the result was empty.
- `000196_property_mutation_receipt_contract_default_drop.sql` remains retained by B4
  and is unavailable to this lane.
- `000191_property_b_homestay_effect_schema.sql` and
  `000192_property_b_housing_effect_schema.sql` remain the only provisional B-2c
  candidates for their respective domain effect schemas. They are absent and were not
  claimed by this R0.
- `000197_*` is absent from the repository, every worktree, every local branch tree and
  both histories on both targets.

The worktree list, empty candidate-file scans and retained authority file manifest are
individually hashed in the immutable grammar. The retained authority digest is
`6eaea3d6731204527bf123b36a923e68a8b2373a4a47578e6d20df0b349211e1`.

## Actual target topology and histories

Target A, `jinhu-b2c197-r0-20260802a-a`, is the upgrade fixture. It was built through
`000184`, applied `000185`–`000190` as phase `u1`, and then applied
`000193`–`000195` as phase `u2`. `000191/000192` were absent.

Target B, `jinhu-b2c197-r0-20260802a-b`, is the fresh fixture. It was built from the
empty database baseline through `000184`, then applied the current ordered Track B chain
`000185`–`000190`, `000193`–`000195` in one phase. `000191/000192` were absent.

On both targets:

- `public.sys_schema_migration_history` and `public.schema_migrations` each contain the
  same nine `>=000185` rows;
- all rows are `succeeded`; `running` and `failed` counts are zero;
- the within-target dual-history delta is zero;
- the four normalized history digests across both targets and both stores are exactly
  `f6450bef2c0eaac1ce52868bb428089471ea1880344b0f780e51917105c9276d`;
- `000186`, `000193`, `000194` and `000195` exactly match the plan-authorized raw
  checksums;
- `000191`, `000192`, `000196` and `000197` counts are zero in every history store.

The fixture loader did not insert a success row before executing its migration. Each
Track B history row was written to both stores only after the corresponding SQL returned
successfully.

## Pre-formal diagnostics

Two discarded pre-formal attempts are retained as process evidence:

1. The first attempt stopped because the existing baseline had already created the
   history table and the loader used a non-idempotent bootstrap statement.
2. After that was corrected and both dedicated databases were recreated, the second
   attempt stopped at real execution of `000190` with
   `property-business-scope-preflight-failed`; it revealed that the fixture lacked the
   second qualifying scope used by the existing C3 harness.

The owner adopted that existing C3 two-scope fixture pattern, recreated both dedicated
databases again, and completed the one formal load. No history row was manually changed
to bypass `000190`; the formal histories contain exact succeeded `000190` on both
targets and no failed/running rows.

## Authority chain

- Plan raw SHA:
  `2c4fefceca0b42307391793c173e2f9f90cdfec86da02be7517d1451898de141`
- Current authority locator raw SHA:
  `e88af264e49aef792aa7b5daa742d074069b83de77a5207b3553018181a721cd`
- Fixture loader raw SHA:
  `0d25972b92405c461cba9847839550bc931ae01ddb214712152edfabfa76d277`
- `000186` raw SHA:
  `5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e`
- `000193` raw SHA:
  `c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07`
- `000194` raw SHA:
  `93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0`
- `000195` raw SHA:
  `9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4`

## Required independent review

Each reviewer must independently recompute:

1. the 5227-byte R0 raw SHA;
2. repository/worktree/branch candidate absence and the retained `000196` owner;
3. exact current hashes for `000186/193/194/195`;
4. both history stores on both bound targets, including normalized digests, exact
   equality, zero non-succeeded rows and `000197` absence;
5. the upgrade/fresh topology and `000191/000192` absence declaration.

Any mismatch returns R0 and keeps SQL creation forbidden. After two independent GO
reviews, the unique migration owner may create the exact candidate SQL and then create a
separate immutable R1 checksum seal referencing raw R0 SHA
`705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`.
