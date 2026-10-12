# Validation and release checkpoint

Base: c538f80961696db17145f7cff77b6eeb17ababc0. Branch: codex/hr-business-trip-date-continuity-20261012.

- Final API unit suite: 2,517 passed, 196 skipped (database/environment-gated tests), zero failures. Separate owned PostgreSQL harness: 36 passed, zero skipped; post-review date-flow PostgreSQL suite passed including successive-edit history union and a 35-date recalculation plan.
- Final API and Web lint/typecheck/build passed. Shared build passed. Date-input helpers: 3 passed. Final focused Web interactions: 42 passed; unchanged declared-days/allocation interactions: 18 passed earlier in the same isolated workspace.
- Review found and repaired loss of old affected dates after successive edits and loss of the saved notice when the parent refresh failed. Focused checks and real PostgreSQL reran after those repairs.
- Local browser: actual components and global CSS, synthetic data. Desktop and 390px had no horizontal overflow; history page 2 reachable; saved row immediately updated; declared days preserved; all 35 affected dates and enabled recalculation action visible. Intentional refresh-failure fixture retained saved-success and refresh-warning notices. This is not production role UAT.
- Prior broad Web run had one failing refresh-warning assertion; repaired and focused suites passed. The broad suite was not rerun and is not claimed as a final full-suite pass.
- Legacy missing/reversed timestamps are read-boundary fixtures: current database constraints cannot persist them. Real PostgreSQL tested a valid century-long historical span without weakening constraints.
- Candidate CI, merge, production deployment with Docker cleanup and readonly actual API/Web revision proof are required before release completion.
- July payroll remains calculate-only/not executed: all 93 imported records, 64 employees, 2,295 items across books 34/35; do not deduplicate overlapping employees. Owner wuenguo. Attendance/insurance/formula inputs and actual business-rule confirmation remain separate work.

Private logs/screenshots: /Users/mac/.codex/artifacts/hr-business-trip-date-continuity-20261012. No private production rows are included here.
