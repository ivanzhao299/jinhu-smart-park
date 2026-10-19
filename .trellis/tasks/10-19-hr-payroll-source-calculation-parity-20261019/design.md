# Design

One implementer owns API/shared/Web source and tests; root owns task/spec metadata, actual-source private diagnostic, CUA and release. Sequential independent full-scope checker after source freeze. Preserve unrelated work. No descendants or child commit/deploy.

## Formal accounting

Add `gross_reduction` to shared role contract and all authoring/CSV/display consumers. The role is an explicitly selected pre-gross adjustment, not post-gross deduction or manufactured negative earning. Existing exact cents/rounding applies. Net balance and 000243 ledger bridge remain unchanged; record positive pre-gross reduction in its own line. Allow signed reversal consistently with supported exact inputs, while current gross/deduction/tax/net nonnegative checks remain.

Keep v1 constant and interpretation/result structure for definitions without the new role. Select a v2 interpretation for any definition containing it, even when the amount is0. Evidence generated at draft/submission/review/effective consumption must bind that version. Add optional grossReductionAmount for v2 only and carry/display it where meaningful; no change to old frozen snapshots. Verify actual run readers and review validators rather than changing version globally. Existing unconstrained item_type varchar32 and JSON evidence should avoid a migration.

## Source identity conversion

Create one small pure route-local helper for building the selected source definition or binding its original references, reused by actual source preparation. Selected items are authoritative; aliases are exact code/legacyName/displayName, parser-trimmed reference whitespace only, with ambiguity checked across item identities. Excluded/disabled/unselected versions cannot resolve a dependency. Duplicate selected code versions reject. Local payroll references substitute only the identifier inside brackets, retaining operators, parentheses and source raw text. Preserve separately supported HR references and existing compensation-policy validation; never invent cross-domain aliases or approve conditions. Do not introduce a new generic parser, Number arithmetic or eval.

Build first, catch conversion errors into actionable existing error UI, and set applied/one-shot state only after success. Keep direct and manual-rewrite choices unchanged. Existing complete source/ref/token/context and parent-empty-draft guards stay. Keep existing selected source order unless a demonstrated current contract requires otherwise; do not silently change business ordering.

## Evidence and release

Root private source runner is under /Users/mac/.codex/artifacts/hr-july-business-review-20261019. It uses original hash-verified 93 rows; only aggregate counts go into repo research. Child must not open payslips.jsonl or copy real rows. Source NULL0 is a labelled diagnostic hypothesis, not a new default. Actual production rules/inputs still need normal independent business review.

No DB migration expected; no import/approval/payment writes. Revert code before any v2 rules exist if release fails; once v2 is used, older images cannot reinterpret it and rollback planning must retain compatible readers. Never rewrite an approved definition or frozen result to make rollback pass.
