# Implementation checkpoint

Base main 8f0188360a8e86b9ad4890fad872a8db62ab41b6, branch codex/hr-employee-directory-export-20261008, one agent. The predecessor contract PR861 is merged and its production deployment 37662723297 is still running; do not merge this candidate before that release/runtime proof completes.

Implemented the directory CSV collector/projection, cancelable permission-aware DS control, actual directory entry and optional employee-query AbortSignal. Shares existing type/status labels. Validates all pages and rechecks the first page; never claims a database snapshot. No new API, database writes, roles or sensitive detail probes.

Checks: modified-file ESLint and current-source Web typecheck pass. Six actual employee React suites: 62 tests pass; focused final export suite: 7 pass. Actual HrEmployeesClient browser with scoped synthetic transport loaded 50 of 120 employees and downloaded all 120 records/eight columns, including SYN-120. Desktop 1280/document1275 and phone390/document385 have no horizontal overflow. Private artifacts/checkpoint: /Users/mac/.codex/artifacts/hr-employee-directory-export-20261008. Temporary local browser tabs closed, viewport reset, user production tab retained. Production CSV and HR-role acceptance remain pending.

Independent S3 read-only audit confirmed policy base-component amount is independent from contributionBase, and includeFund changes aggregate totals while still calculating fund items. No arithmetic changes were made from a misleading variable-name inference.
