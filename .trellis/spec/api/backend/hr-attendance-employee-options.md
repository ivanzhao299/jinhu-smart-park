# Attendance operation employee candidates

`GET /hr/attendance/employee-options` accepts validated `page`, `page_size` (1–100, default20) and optional trimmed `keyword` (max100). Controller and Service require exact `hr:attendance:operate` (or existing super/wildcard authority); Service also requires actor tenant/park equal current scope before querying.

Candidates are non-deleted, active employees in the current tenant and park. Name/code search escapes PostgreSQL LIKE wildcard characters, uses bound TypeORM parameters and preserves literal `%`, `_`, and backslash. Pagination orders by employeeCode and unique ID. Query selects only ID, employeeCode and fullName; response explicitly projects the same keys.

Required metadata audit records attendance field group, route, projection and count, never keyword, personal values or source rows. Audit failure prevents response. No permission/seed/schema or attendance write semantics are changed.

Verify Service allow/deny/foreign-scope before-query behavior, DTO bounds, exact projection, metadata failure, and actual PostgreSQL scope/search/pagination. The optional isolated query-fixture test uses explicit loopback55679 and a newly created random database that is removed; it is not migration or production acceptance.
