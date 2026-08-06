# B2a/C2 v12 targeted receipt-race root cause

## Status

Static correction complete. A new targeted Docker run is required; this correction does not authorize a candidate artifact.

## Failure

The targeted run ending in suffix `20260801c` passed migration chain, migration history, and reservation checks, then timed out waiting for two receipt-acquire observation rows. All ten retained polls returned zero and cleanup passed.

## Root cause

Both detached psql workers executed `receiptAcquireSql(input)` inside `SELECT ... FROM (<acquire>)`. The acquire query contains an `INSERT` CTE. PostgreSQL permits a data-modifying CTE only at the top level of its statement, so both workers exited before inserting an observation. The parent only polled the observation count and discarded detached stderr and exit state, reducing the real SQL failure to an unexplained sequence of zero counts.

This was not an advisory-lock deadlock, an uncommitted observation visibility problem, or a reason to weaken winner/loser assertions.

## Correction

Each acquire query is now issued at psql top level and captured with `\gset`. The race uses two explicit transactions with a deterministic order:

1. A holder owns an exclusive winner-commit advisory latch.
2. The winner performs the top-level acquire, proves `execute`, and waits on the shared commit latch while its receipt remains uncommitted.
3. The loser performs the same top-level acquire and is proven blocked by the winner transaction through `pg_blocking_pids`.
4. Releasing the holder allows the winner to record evidence and commit.
5. The loser's first statement completes with the snapshot-safe absent result, then a new top-level statement retries and must resolve the committed receipt as `fail-closed-started` (or the existing exact contract's accepted completed replay if future business completion is added).

The exact one-winner, one-receipt, loser replay-or-started, zero-loser-insert, one-loser-lock, and no-final-absent assertions remain unchanged.

## Diagnostics

Every detached worker now has retained stdout, stderr, and exit-code files in the ephemeral container. Timeout errors include the last observation timeline, worker diagnostics, and `pg_stat_activity` snapshots containing PID, state, wait event, blocking PIDs, and query text. Successful evidence also records both latch timelines and worker exit diagnostics.
