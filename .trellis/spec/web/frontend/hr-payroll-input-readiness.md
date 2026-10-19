# Payroll reconciliation input preparation

- Reuse scoped reconciliation setup; no extra employee, payroll or monetary probes.
- Recognize only IDs present in the current published/frozen source and closed effective attendance lists. No default source/month/insurance selection.
- Frozen source has a known book/month. Filter attendance by that month; clear incompatible attendance and all insurance choices when changing source, including newly prepared frozen sources.
- The derived valid source/attendance pair gates both insurance-options requests and simulation submission. Do not wait until POST to report a known mismatch.
- Published batches do not expose a fixed payroll month: do not infer one from publication time; retain server validation.
- Present preparation metadata on desktop and phone, preserving the existing desktop-only simulation/review boundary. Attendance navigation uses existing attendance read/input-read permissions.
- Input readiness does not approve formulas or prove compensation/insurance facts or actual monetary equivalence. Preserve server-authoritative checks and no-payment behavior.
- Frozen sources identify one book only. The reconciliation setup's books (LIMIT 100) and approved net-item candidates (LIMIT 500) are bounded preparation data: a missing book, formula candidate, or policy there is unknown, never a global absence or business acceptance decision. A visible current policy is coherent only when its policy and net-item identifiers both match a visible approved candidate.
- Published sources can cover multiple books. Do not infer one book or month from publication time; state that each applicable book still needs confirmation by the authoritative simulation path.
- After insurance is selected, keep the period/rule/person and backend checks explicit; insurance selection alone never means the simulation is ready or eligible.
- Rule-read actors may open the existing rules work area without additional probes. Reconciliation reviewers may focus the existing desktop net-policy form while retaining the selected preparation state; phone layouts must offer desktop continuation guidance instead of a dead form action. Actors lacking either permission receive actionable contact guidance.
- DS scene cards normally reserve an icon column: text-only preparation cards need a route-local single-column layout override, including mobile. Do not replace DS colors/buttons/borders.
- Verify the actual HrPayrollClient interaction, request absence on mismatch, reset on source changes, published compatibility, and desktop/390px render.

## Saved input to exact-batch review and month return

- `PayrollInputReviewIntent` carries only saved batch ID, period/rule/version/revision identifiers, an explicit optional source batch/month, and a navigation nonce. Money remains in the saved server record, not in the handoff.
- Validate save receipts against submitted period, rule set/version, positive revision/version, draft status and complete employee count before exposing navigation. An uncertain receipt preserves the original idempotent retry, without creating a different request.
- Re-read the exact saved batch by ID even when absent from the first list page. Verify immutable ownership; accept current server status/version and `canEdit`/`canConfirm`. Another reviewer confirming the batch must not make the same batch unreadable.
- Do not clear the explicit saved selection when the list loads for the newly selected period. Wrong: the list effect always calls `setSelectedId("")`. Correct: coordinate period/list ownership with the pending exact selection so only an actual context change invalidates it. Initial detail failure must expose a detail retry without re-saving the batch.
- Preserve an existing unsaved whole-batch edit when a new view intent arrives; defer the new intent until that edit is saved or cancelled. Drop old-token/aborted detail results and invalidate cross-identity intents.
- Return to the original source/month only after a new catalog read confirms the pair. Repeated returns to the same month require a new selection epoch, fresh readiness, and cleared old trial selections/results. Do not discard unrelated preparation drafts or cancel a source write; disable return during the relevant write.
- Required composed regression: mount actual Modern/Trial/Preparation/InputOperations; start with empty input period, prepare and save a complete source roster, navigate to an off-first-page saved ID, fail/retry its initial read, observe another reviewer's confirmed status, and return twice to the same source/month with fresh readiness. Assert no automatic confirmation/calculation, exact decimal strings, original request retry, and retained unrelated drafts. Separate child tests alone do not prove parent wiring.


## Explicit source-value preparation

- Monetary candidates are opt-in on the existing preparation request, requiring the existing whole-park history amount capability as well as the normal preparation intersection. Default roster calls must not request or expose values. This is a protected input workspace, not the metadata-only cohort export.
- Collect the complete selected source roster with consistent source/hash/roster/rule/version/head/period and draft/token ownership. Reject incomplete, duplicate, late or changed-owner replies before application. Values are exact strings from PostgreSQL, never converted to JS numbers for display or editing.
- Preview all direct-code old/new values and explicit missing/NULL/nondecimal/ambiguous issues with pagination. Default to filling blank fields, preserve existing manual values and settlement metadata, and require separate explicit replacement intent to overwrite populated fields. Missing candidates retain existing or blank values, never implicit zero.
- Apply changes locally only after clear confirmation. Source/period/rule/roster/draft/identity/token changes invalidate the preview; source writes and save locks prevent conflicting apply. Continue through the existing idempotent save→exact saved detail path; never auto-confirm or calculate.
- Actual composed browser and tests cover full54person roster including last-page max precision/negative/explicit zero, missing values, manual edits preserved, stale preview denial, failed-save same-key retry and detail read. Desktop and390px layout remain required; synthetic source reuse does not prove actual payroll amount equivalence.

- Roster identity must exclude the optional financial projection: use `candidateMetadata(old.employee)` and `candidateMetadata(employee)` when comparing a selected candidate with the default roster response. Wrong: full `JSON.stringify(old.employee) === JSON.stringify(employee)` after preview stores `sourceValues`, causing a later metadata-only roster refresh to replace manual inputs with blanks. Required regression: source apply → manual income edit → complete roster refresh retains exact income, explicit zero and settlement fields.
