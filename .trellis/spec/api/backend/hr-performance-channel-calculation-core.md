# Pure performance channel snapshot core v1

## 1. Scope / Trigger
Use for exact calculations over a caller-frozen complete five-channel snapshot. Migration370 introduces two owner-executable pure functions; existing dimension and source-fact helpers remain unchanged. This is a mathematical foundation, not editable template storage, an API, workflow activation, source-person binding, or business acceptance.

## 2. Signatures
`hr_performance_five_channel_snapshot_total_v1(weights jsonb, details jsonb, adjustments jsonb) RETURNS numeric`.
`hr_performance_threshold_snapshot_grade_v1(total numeric, levels jsonb) RETURNS jsonb`.
Both are IMMUTABLE, SECURITY INVOKER, with `search_path=pg_catalog`; PUBLIC EXECUTE is revoked. Later callers need a separately reviewed grant to an actual deployment role. They perform no business-table reads/writes or dynamic SQL.

## 3. Contracts
Weights have exactly `sPercent/mPercent/tPercent/xPercent/cPercent`, each an int32 plain integer string or explicit JSON null. Details are a complete array with exactly `id/selfValue/mItemValue/itemValue/xItemValue/cItemValue`; IDs are unique unmodified strings of length1..128. Different details belonging to the same item must all survive. Adjustments have exactly `masterValue/timekeepValue/bonusValue`. Detail and adjustment values are plain decimal strings with at most two fractional digits in numeric(18,2) range, or explicit JSON null. No scientific notation, whitespace, leading plus, JSON numeric, or implicit missing-field defaults. Leading zeroes and negative zero are legal decimal strings. IDs preserve whitespace and case; whitespace-only IDs are nonempty and valid.

Let NULL values equal0. Sum each channel over ALL rows; cast only the complete M/X/C sums to numeric(18,0), which rounds signed half values away from zero. Multiply the five sums by their integer percentages divided by100, add all three adjustments, then round ONCE to2 decimals. S/T remain fractional. Weights may be negative or sum to any value; do not normalize, clamp, or reinterpret them as dimension weights. Cast M/X/C even for a zero/NULL weight so overflow remains visible. Empty details return SQL NULL after validating all inputs; nonempty all-NULL details return0. Final result is unbounded numeric, without a final numeric(18,2) cast.

Levels have exactly `id/grade/minValue`; unique IDs follow the detail ID rule, grade is an unmodified string of length0..64, and minValue follows the numeric(18,2) decimal-string rule or JSON null. Complete candidates are frozen by the caller; do not filter by template, max, order or a UI page limit. A finite total with scale<=2 is accepted, including negative and >100 totals; SQL NULL is accepted. Select the highest non-NULL min<=total. Result keys are `status/expectedGrade/winningMinValue/winningCandidateCount`; winningMinValue is a decimal string or null. A unique winner gives RESOLVED; absent total gives TOTAL_UNAVAILABLE; no eligible winner gives NO_ELIGIBLE_GRADE; multiple highest-threshold rows give AMBIGUOUS_TOP_THRESHOLD and null grade, even if grade strings are equal. RESOLVED is not source MATCH evidence.

## 4. Validation / Error Matrix
Malformed shape, unknown/missing key, wrong type, duplicate ID, nonplain decimal, nonfinite value or excess decimal places ->22023 with a fixed message. int32/numeric(18,2)/intermediate numeric(18,0) overflow ->22003 with a fixed message. Error messages do not echo input. Validate levels even when total is unavailable, and adjustments even when details are empty. No execution permission ->42501. No partial result or truncation is allowed.

## 5. Good / Base / Bad Cases
Good: two M details0.40+0.40 become1 before weighting. Base: empty details with a nonzero adjustment still returnNULL; one fully explicit NULL row returns0. Bad: round each M row first; subtotal-round before adjustment; infer NULL weight as100; collapse details into an item-keyed object; select the first tied grade; use JS Number for18digit decimals.

## 6. Tests Required
Run the explicitly enabled owned PostgreSQL suite documented in `docs/testing/hr-performance-channel-core.md`, plus API lint/typecheck. Synthetic fixtures load frozen300/302/304/321, compare totals/grades, assert signed half/cross-zero cases, complete101details/41+levels, exact18digit values, int32 and intermediate boundaries, strict rejection, owner-only access, invoker purity under a role without table SELECT, unchanged existing function definitions/ACL and fact digests. Migration constant self-checks run beforeCOMMIT and create no facts. A required PostgreSQL run failing to start must fail, never skip or fall back to a shared database. Cleanup must still inspect the exact generated name and verify its ownership label after a partial Docker creation failure, and container removal must run even when connection shutdown throws.

## 7. Wrong vs Correct
Wrong: claim these functions reproduce all bs_ass_compute branches, establish source-person/template relationships or authorize payroll. Correct: preserve bs_ass_compute pending and u_printassessment existing credit; require000309 receipts/relationship checks and actual identity/scope/workflow authorization in the future parent integration. Correct: source field S/M/T/X/C names do not invent M/T/X/C business labels, scoring roles or adjustment generation rules. Forward-only defects need a subsequent migration after370 is applied.
