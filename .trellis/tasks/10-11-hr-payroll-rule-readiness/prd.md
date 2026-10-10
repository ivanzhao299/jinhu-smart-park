# 工资核对规则准备与操作导航

## Objective
Modernize the existing payroll reconciliation preparation panel using actual production evidence (PR944): latest observed payroll source July2026,93 mapped snapshots, zero approved formula/net policies. Wu Enguo owns latest complete period and rule confirmation. Do not redo import.

## Acceptance
- Extend existing PayrollInputReadiness, not a parallel workflow or new API.
- For selected frozen source, show known book-specific approved formula candidates and current net-item policy metadata; missing/unknown bounded setup metadata never implies backend ineligibility or business rule acceptance.
- Published source can span books; do not infer month/book from publication time or treat one book as coverage.
- Fix the false all-ready claim after choosing insurance. Explicitly retain period/rule/person verification and backend authority.
- Rule-read actors can navigate into the existing rules work area; those without permission see actionable contact guidance without extra probes. Current net policy preparation action goes to the existing policy form only for reconciliation reviewers; preserve selection/drafts when practical.
- No automatic approval/calculation/source preparation, no changed server/submit eligibility, no permission changes, no production business writes.
- Shared DS cards/buttons and wrapping, desktop and390px inspected in in-app browser.
- Meaningful existing HrPayrollClient interaction tests extended: frozen book changes, known missing/configured metadata, bounded unknown and multi-book published path, permission-aware navigation and no false readiness claim; existing mismatch/reset/insurance checks pass.

## Out of scope
Import replay, formula or net-policy autoapproval, tax/insurance default assumptions, monetary equivalence or production role UAT, changes to API/shared/DB/workflows.
