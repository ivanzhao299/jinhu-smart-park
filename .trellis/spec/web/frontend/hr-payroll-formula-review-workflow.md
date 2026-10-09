# Payroll formula review work area

## 1. Scope / Trigger
Rules page lacked an actionable formula detail/review surface despite an existing API. PayrollFormulaReview is mounted outside desktop-only history case work; it loads independently.

## 2. Signatures
PayrollFormulaReview -> payrollHistoryBooks, payrollHistoryFormulas, payrollHistoryFormula and existing reviewPayrollFormula. Full HrPayrollClient rules area mounts it only for rule-read users; exact formula-review permission controls decisions.

## 3. Contracts
Empty book/status means all; all four statuses are available. Book options and formulas each paginate20, preserving chosen book across option pages and resetting formula page on filter changes. Complete auth JSON keys the workspace; old reads abort, draft/detail clears on changes. Source text stays read-only; dependencies use business labels. Approval means simulation only and requires syntax_ready plus explicit reason; rejection remains allowed for blocked nonterminal sources. Synchronous writer gates filter/paging/detail changes; failed POST preserves reason; successful POST locks resubmission even if list refresh fails. Original selected source version remains immutable.

## 4. Validation & Error Matrix
No RULE_READ ->no reads; no exact review ->no actions; empty reason/terminal/blocked approval ->disabled/no POST. Failure shows error with retained reason. Committed-refresh failure explicitly says submitted and forbids replay. Context switch discards late data/write notices.

## 5. Good/Base/Bad Cases
Good: choose actual formula, inspect full text/condition, submit reason and see appended status. Base: read-only/phone views keep complete formula access. Bad: fixed manual-review-only list, raw UUID book labels, automatic approval, hiding all formula work behind desktopSensitive, or resetting inputs after a failed write.

## 6. Tests Required
Actual component tests for authority/request absence, all status/book/paging filters, full source, failed retry, duplicate flight, committed-refresh failure, unsafe and terminal decisions, pending filter lock and identity changes. Actual full HrPayrollClient with synthetic API is inspected desktop1275 and390px phone, no horizontal overflow. Existing HR route contracts remain intact; synthetic screenshots do not prove production business decisions.

## 7. Wrong vs Correct
Wrong: infer formula equivalence from successful parsing or expose technical parser prefixes to HR users. Correct: display real business dependencies and explicitly retain server and business rule acceptance gates.
