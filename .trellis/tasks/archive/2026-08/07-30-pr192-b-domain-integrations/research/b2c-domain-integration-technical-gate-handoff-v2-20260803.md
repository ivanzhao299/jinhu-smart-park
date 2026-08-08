# B2c/B3 Domain Integration Technical Gate Handoff v2

## Status

`TECHNICAL CODE/DB/AUTOMATION GO / COMPLETE DOMAIN MACHINE GATE BLOCKED BY BROWSER ENVIRONMENT`

This handoff supersedes `b2c-domain-integration-execution-handoff-v1-20260803.md`.
DEC-01 through DEC-06 A and the user-authorized offline signer/role evidence have been
consumed. The final independent read-only audit reports zero open code, database, or
automated-test P0/P1 findings. The task remains `in_progress` because the official Codex
in-app browser rejects this WSL workspace before page selection with
`sandboxCwd is not a local file URI`.

## Closed technical gates

- Housing checkout uses canonical advisory keys, stable lock order, contributor hashes,
  draft handover ID/version and target receivable freeze. DEC-04/05/06 executor PG tests
  cover success, replay/CAS drift, injected rollback, aggregate transfer, actor audit,
  refund and terminal/repeated void rejection. Housing suite: 103/103 PASS.
- Homestay cancellation freezes the submission-time fee and complete occupancy,
  credential and ledger contributor set; execution performs occupancy release,
  credential invalidation and finance effects atomically. Legacy unresolved allocation
  blocks new approval instead of inferring provenance.
- Identity check-in and property-foundation proof/reconcile are backed by real
  PostgreSQL TOCTOU and fail-closed tests. Audit-only, aggregate-only and state/version/
  source drift do not prove completion.
- Migration `000198_property_finance_owner_integrity_forward_fix.sql` adds forward-only
  owner/currency/lifecycle integrity and concurrent DEC-02 balance enforcement without
  editing successful prior migrations. Legal, deferred, negative and rollback PG cases
  pass.
- Exact-role runtime authorization passes through a real Nest HTTP stack; module,
  endpoint permission, database grant, park scope, event-resource scope and wildcard/
  super-role anti-bypass cases are covered.
- Runtime feature control passes the real PostgreSQL enforce -> disabled -> re-enable ->
  disabled drill while preserving request, receipt, audit, outbox, domain and identity
  evidence.
- Shared build/tests, API lint/typecheck/build, Web lint/typecheck/build (158 routes),
  application bootstrap, decision validation and `git diff --check` pass.

## Frozen evidence

- `000198` migration SHA: `f722e626d83d1ce2f4d863719105b2e25361a1ea058ce9da10d96694fc2d4620`
- `000198` handoff SHA: `094ff5991470a35c88557d9bae27d54041b51fd510c479c6d82ceef9cdf9f04b`
- Housing executor PG spec SHA: `313e67ec4634e1aa143c2a19d385defbc4200567e6dfa1ee459fa46c05241fd7`
- Housing concurrency PG spec SHA: `1235588c28ebdcd056bc7413996724d9a55038a56ce7ec526f1dacd89fcd9bf9`
- Identity/foundation PG handoff SHA: `d677c6ff3bc810cf79cdcb9580dff66cea18a94e174341b87892ad72290d4efe`
- Identity check-in PG spec SHA: `a9e80be48238b13918d2ffcb6b696ac44ba1d0f3e2621a87ff47e2f4737b2dce`
- Foundation proof PG spec SHA: `829decfcf477b6be5b0b29302b5b64bda12344f9f5aa13c2aa6ad135a6962d30`
- Runtime control PG handoff SHA: `d403a73c2ad450641c1c8efa33dbe3bfce9b7cdf61b5d3bfdaac9b2117f226aa`
- Runtime control PG spec SHA: `8c5c4579580c5783ccf5602845194920783ac383eb988a9a1b89a6e584162f25`
- Current authority locator SHA: `c39e67e69849640a2589e9b7b08406028a744ef6d08cf499eb13ef17defd0459`
- Effect-kind erratum SHA: `b3b3fa9c0d8d00cc827e5ce422368dfff399c59f91ce012207e4843fe9687e85`

## Remaining task gate

Restore the official Codex in-app browser connection, then capture the canonical
property/homestay/housing pages at desktop and 320/360/390/768 widths, keyboard focus
and dialog behavior, screen-reader semantics, 200%/400% reflow, reduced-motion and
forced-colors behavior. HTTP 200 responses and static component contracts do not replace
this visual/accessibility evidence.

## Operational notes and residual risks

- Existing in-flight housing checkout approvals created before contributor hashes were
  introduced fail closed and require withdrawal/resubmission or an explicit reconcile
  procedure.
- The default local development database was previously advanced through `000188`; its
  `000189` preflight failed. It is not release evidence and was not rolled back. Final
  migration execution must use `scripts/db-migrate.sh` against an approved target.
- The latest temporary PostgreSQL test databases were dropped and the default database
  was not modified by those tests. Synthetic insertion of a `000198` migration-history
  row into the shared/default database was intentionally not performed.
- The worktree contains broad pre-existing/user changes. No commit, push, deployment or
  production mutation is claimed by this handoff.
