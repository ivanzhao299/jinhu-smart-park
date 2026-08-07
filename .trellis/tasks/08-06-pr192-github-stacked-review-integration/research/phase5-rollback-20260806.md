# Phase 5 rollback evidence log — 2026-08-06

## Invalidated run

- Run: `rollback-20260806T082342Z-71ab7c8bf28e`
- Final SHA: `71ab7c8bf28e7caa0494265e76f05808c558e829`
- Result: fail-closed during the first baseline Web production build.
- Cleanup: PASS; database, template, clone role, credential, lease, container,
  network, volume, port, worktree, temp-file, and secret-file residuals were all
  zero. The frozen source dataset and schema were unchanged.

The run is not admissible final evidence and must not be reused after the PR head
changes.

## Defects found by the formal gate

1. Four reviewed rollback metadata files used expanded commit SHAs (and one used
   reverse-diff order) instead of the frozen profile's exact commit refs/order.
   The formal preflight correctly rejected them. They were corrected and the
   patch and plan approvals were independently repeated.
2. Next.js 15.5.18 emitted the public build diagnostic URL
   `https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config`.
   The rollback output policy allowed the same documentation page without the
   fragment but rejected this exact new public diagnostic. A minimal exact-entry
   allowlist update and positive/negative regression coverage are required; the
   general URL, query, fragment, credential, port, and lookalike-host rejection
   policy remains unchanged.

## Invalidation decision

The sanitizer fix changes the frozen runner component hash, so it requires a new
commit, PR head, CI run, rollback run ID, source binding, patch/plan approvals,
supervisor approval, and formal execution. No artifact from the invalidated run
may satisfy the final-SHA gate.

## Performance preflight finding after the b632 rollback run

The final-bound `b632af33` rollback run passed 19/19 with zero residuals, but the
subsequent formal-performance environment review rejected provisioning before
any environment mutation. `assertSourceReady()` used
`--untracked-files=no`, allowing an untracked file below a formal source path to
enter commit-bound image builds without failing the dirty-source gate.

The fix changes the performance environment script and therefore the PR head.
The `b632af33` rollback evidence remains valid only for that ancestor SHA; the
final rollback and performance gates must both be regenerated on the new head.

## High-port listener collision after `6ea4063b`

The formal run `rollback-20260807T025012Z-6ea4063b7972` passed its first seven
cases, then failed closed during the flags-on baseline smoke for
`homestay-finance`. The Web listener selected port 52423 from the runner's
broad high-port band and another local listener acquired it after prepare,
producing `EADDRINUSE`. The host's observed ephemeral range was 44620-48715;
52423 was outside that exact range, so the evidence supports a high-port
collision but does not identify the competing listener as an ephemeral socket.
Per-case cleanup passed with every residual field at zero; the run remains
failure evidence and is not retried in place.

The runner now derives API ports in 20000-24999 and Web ports in 25000-29999,
with a regression contract requiring both authority-only bands to stay below
the default Linux ephemeral lower bound of 32768. This changes the frozen
runtime-control component hash, so a new commit, CI run,
run ID, source binding, patch reviews, plan approvals, and all 19 formal cases
are required again.
