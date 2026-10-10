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
