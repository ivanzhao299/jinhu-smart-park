# Prepared profile command and preview replay

## Scope

Use the existing private prepared-profile catalog and normal API user. Do not repeat original analysis, change frozen source recipes, add roles or bypass source comparison. Source completion and runtime deployment are separate acceptance facts.

## Signatures

`node scripts/hr-cutover/import-yuzhou-prepared-profile.mjs --mode catalog|preview|status|commit --credentials <private-file>`. Preview additionally binds batch ID, index, expected file SHA and count; all non-catalog modes use a per-package receipt. Explicit `--retry-preview yes` refreshes a missing plan for the same operation.

## Contracts

Authenticate through auth/login then users/me, checking exact username, fixed tenant/park and profile management permission. Production origin is fixed; explicit HTTP loopback supports isolated tests. File SHA and canonical operation SHA are independent. Persist mutation intent/key before POST, lock receipt ownership, retain operation ID/hash/count across recovery. Preview of an existing previewed canonical package recomputes plan under existing package advisory lock and operation row lock, then returns the same operation metadata. It creates no new operation or business/ledger rows. Terminal replay returns original result without replanning.

## Errors

Missing permission/scope, redirect, invalid catalog/order/selection/binding, unsafe private files or unexpected result conservation fail closed with narrow error codes. Missing plan refuses commit. A commit network loss triggers one read-only recovery of the same operation; an unconfirmed/previewed result retains uncertain state with no automatic POST. Explicit status queries recover the original operation. A conflicted terminal result remains inspectable with conserved counts and blocks the next package. Do not print upstream bodies or personal rows.

## Good and bad examples

Good: query catalog, persist a selected package receipt, inspect preview, commit that ID once; use the same saved key after explicit recovery. Bad: delete receipt after timeout, switch accounts or create a new operation to evade conflict; compare file and canonical hashes; treat successful deployment as successful import.

## Tests

Run command HTTP fixtures and real incremental PostgreSQL fixture. Check same-ID/hash/count replay, zero new business/ledger rows, recomputed conflict after modern edit, denied revoked permission and unchanged terminal response. Command fixtures cover lost response, original-ID recovery, stable refresh key, terminal zero writes, file permissions and narrow outputs. CI includes the command tests in the existing HR gate.

## Correcting the former behavior

Previously any existing operation returned status only, so a second explicit preview could not inspect a current plan. Recompute only previewed operations; leave terminal results unchanged. A separately persisted plan-refresh key avoids old interceptor cache while retaining original preview/commit keys and canonical operation identity. Keep normal CAS and commit permissions as the final writer checks.
