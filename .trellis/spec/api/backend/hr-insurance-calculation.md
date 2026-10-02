# Modern insurance calculation

Scope: `hr-insurance-calculation.ts`; modern preview arithmetic, no historical update or business workflow acceptance.

- Require one selected policy version, six distinct imported insurance kinds and explicit fund inclusion. Resolve effective policy/variant and authorized employee scope in the future caller, never inside arithmetic.
- Fractional rates are already divided by 100 at import. Keep six decimal places; the payroll DSL four-place intermediate arithmetic is insufficient.
- For each of four independent components, compute base × rate + fixed addend exactly, then round to cents once. Sum rounded components across kinds; calculate fund items even when excluding them from totals. Base component is independent, not the sum of employer and employee.
- Missing rate/base/policy rejects. Only explicit null fixed addend means zero. Negative inputs/results requiring review and numeric storage overflow reject without changing history. Reject a tiny negative pre-round amount rather than hiding it as zero.
- `numeric(18,2)` base/result, `numeric(18,6)` rate, `numeric(18,3)` addend are input/output bounds. Use BigInt integers with explicit scales; never Number monetary arithmetic.
- Test addition-before-rounding, per-item rounding-before-aggregate, micro-rates, fund toggle, missing/duplicate data, exact large amounts, negative sub-cent values and aggregate overflow.
- This module alone proves neither permissions, effective periods, preview persistence/concurrency, confirmation/correction nor payroll business reconciliation. Online integration requires those checks plus immutable version/input evidence.
