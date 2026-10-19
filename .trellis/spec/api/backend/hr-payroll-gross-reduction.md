# Formal pre-gross reductions and source reference binding

## 1. Scope / trigger
An explicitly authored payroll rule may subtract quality/absence adjustments before gross. This must be distinct from deductions after gross and must not reinterpret already approved v1 definitions.

## 2. Signatures
Shared `FormalPayrollRole` adds `gross_reduction`. Definitions containing it use `jinhu-formal-payroll-v2` interpretation; definitions without it keep the exact existing v1 interpretation and result shape. A v2 calculation may expose `grossReductionAmount?: string` through the protected formal detail contract.

## 3. Contracts
Apply the existing per-line exact half-up rounding. `gross = sum(earning) - sum(gross_reduction)`; `gross = deduction + tax + net`. The new role is positive for reduction and negative for return. Do not add it again to `deductionAmount` or the run ledger bridge. Current gross/deduction/tax/net bounds and nonnegative total checks remain. New interpretation selection depends on definition roles, never current amounts. Bind it into draft/submission/review/effective evidence; old frozen v1 evidence must recompute unchanged. No approved/frozen writes or migrations are needed merely for the existing unconstrained varchar32 item role.

## 4. Validation / error matrix
An old definition still fails when gross differs from earnings. A new role permits only its declared pre-gross equation, not arbitrary unbalanced gross/net. Computed input overrides, undefined/cyclic/wrong-order dependencies, missing inputs, overflow and negative existing totals retain their errors. Source NULL handling remains strict; a diagnostic hypothesis is not a product default or business approval. Source preparation must distinguish correctable local formula-binding errors from failed, denied or drifting source reads: changing a local choice may clear only its local binding error. A source-validity error remains blocking until a successful fresh read reestablishes the exact source context. Catalog aliases remain byte-exact; only whitespace around a parsed bracket reference may be trimmed.

## 5. Good / base / bad
Good: earning100, gross_reduction10, gross90, deduction3, tax5, net82. Base: no new role produces the existing v1 result/evidence exactly. Bad: count the same10 in both pre-gross and post-gross deductions, relabel it as negative income, remove balance checks or globally change old interpretation versions.

## 6. Required evidence
Synthetic math/rounding/reversal/DTO tests and old v1 evidence regression; actual PG new v2 rule/input/run/detail/independent review/freeze/audit rollback and ledger bridge. Root-only private real-source93 diagnostic candidates must disclose pending NULL policy and business approval, and contain no personal rows in repo/logs. Full release/runtime evidence and actual business acceptance remain separate.

## 7. Wrong / correct
Wrong: source preparation emits platform codeU460 but retains `[基本工资]` as an unresolved dependency. Correct: bind each local original reference to exactly one explicitly included source item version's code, retaining the raw original expression separately. Reject excluded/missing/ambiguous/duplicate-code references with no partial application. Do not guess HR field aliases or strip original conditions. Keep successful direct and manual rewrite paths unchanged.
