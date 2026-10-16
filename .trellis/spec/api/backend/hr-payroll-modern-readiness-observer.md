# Modern payroll readiness observer

## 1. Scope / Trigger
Production preparation evidence for all-month payroll comparison must distinguish
modern approved rules/confirmed inputs from old formula simulation counts.

## 2. Signatures
`diagnosePayrollReadiness(deployPath, run?)` preserves the old counters and adds
`modernPreparation`, `modernCalculationReadiness`, `modernPreparationScope` and
`legacyFormulaCountsAreModernPrerequisites`. The module remains self-contained
for SSH stdin execution; imports must be Node built-ins only.

## 3. Contracts
The modern nested object has exactly eight safe nonnegative integer counters:
`sourceBookCount`, `linkedRuleBookCount`, `effectiveRuleBookCount`,
`draftInputCount`, `confirmedInputCount`, `currentRuleConfirmedInputCount`,
`bookWithCurrentRuleConfirmedInputCount`, `exactRosterBookCount`.
Scope is `LATEST_OBSERVED_ACTIVE_ELIGIBLE_SOURCE_BOOKS`; calculation readiness
is always `UNVERIFIED`; legacy counts are not modern prerequisites (false).
Effective approved version selection and latest confirmed revision semantics
follow the existing formal rule/input consumers. All joins preserve tenant/park.
Exact per-book roster equality preserves cross-book overlap, rejects duplicates,
and never depends on names, page counts, inferred zeros or amount arithmetic.

## 4. Validation & Error Matrix
Source-book count cannot exceed active-book count; without linked rule books neither draft nor confirmed inputs may be counted. A missing observed month cannot have modern source books. Missing/extra keys, invalid numbers or impossible counter inequalities produce
`HR_PAYROLL_READINESS_RESULT_INVALID`. SQL/startup failures retain
`HR_PAYROLL_READINESS_PROBE_FAILED`; private stderr is not returned. No fallback
zeros and no ready=true inference are allowed.

## 5. Good / Base / Bad Cases
Good: two books share an employee and each input matches its own complete roster.
Base: no linked rules gives zero modern preparation counts, independently of old
formula approvals. Bad: a future approved version, stale confirmed input, foreign
rule or correction input is labelled usable for an ordinary month trial.

## 6. Tests Required
Run the contract and required owned PostgreSQL commands in
`docs/testing/hr-payroll-modern-readiness.md`. Cover full strict output validation,
SQL effective/revision/scope semantics, duplicate and missing rosters, correction
supersession, closed periods and immutable observed rows. The same owned tmpfs fixture executes the complete generated observer SQL against empty projection tables, and cleanup verifies removal of its labelled container/volumes. No full-schema or actual
financial acceptance claim follows from minimal query fixtures.

## 7. Wrong vs Correct
Wrong: old `approvedFormulaCount=0` means modern rules are unprepared, or all
modern counters matching means wages are correct. Correct: report the models
separately; require actual input/dependency/version/amount and business acceptance
evidence from the modern trial before concluding financial readiness.
