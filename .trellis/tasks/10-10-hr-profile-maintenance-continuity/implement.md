# Implementation
1. Implement frontend profile save continuity and caller key support, with actual component interaction tests. Frontend implement agent owns only employee page/route-local component if needed, hr-api adapter and relevant web tests.
2. Root owns approved-employment controller audit metadata correction and minimal API contract assertion, task docs/spec/checkpoint. No concurrent overlap.
3. Run focused employee/profile tests, relevant API contract, web lint/typecheck/build. Independent Trellis check reviews whole diff and fixes verified issues.
4. Inspect actual compiled affected UI desktop/390px with synthetic inputs if production session unavailable, clearly label evidence.
5. Fetch latest main, commit/push/PR, CI, merge, deploy with Docker cleanup and independently observe actual API/Web runtime SHA. No production HR mutation for testing.
6. Checkpoint actual results and remaining role/payroll acceptance. Do not claim full program complete.
