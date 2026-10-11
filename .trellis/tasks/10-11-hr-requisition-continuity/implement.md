# Execution

1. Implement backend DTO/service/controller/module, forward migration000360, listversion/conversionversion integration and focused unit tests. Root owns isolated full-schema PostgreSQL setup/run/drop; child must not touch production, DB lifecycle or Git mutations.
2. Root builds exact modern Web maintenance/state/history and paged reference UI against agreed API contracts; focused interaction tests cover permissions, unknownretry, stale conflict, parent interlock and all-width records.
3. Focused API/Web tests, lint/typecheck, required reviewer; root isolated PG proof then native in-app browser desktop1280/mobile390 synthetic runtime. Preserve fullraw logs privately and only bounded receipts.
4. Commit only required files, pushPR, watchCI, merge onlatest main, deploy full scope and verify merged tree/runtime SHA/health/migration/cleanup. Actual user role UAT remains separate if authenticated session unavailable.
5. Update external canonical checkpoint and record remaining full parent acceptance, never mark full goal complete for this slice.
