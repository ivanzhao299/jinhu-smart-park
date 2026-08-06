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
