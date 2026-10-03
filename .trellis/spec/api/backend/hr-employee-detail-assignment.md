# Employee detail assignment labels and probation date

`detailEmployeeForActor` verifies principal tenant/park and existing employee park/team/self scope before any relationship projection. Detail adds only `assignmentDetails` name/status allowlists and the saved employee aggregate `probationEndDate`. Employee directory and other generic projections keep their existing allowlist. Null dates remain null; contract dates or probation months never fill the employee date implicitly. Attendance card remains excluded.

Organization and position queries bind tenant, park, nondeleted and the saved employee relationship. Position must match the primary organization. Disabled rows retain their business name with inactive status; no relationship, unavailable relationship and older API response are distinct. Display never falls back to database IDs.

Manager names use existing employee access checks. Self or managed-tree scope cannot turn a manager UUID into a hidden employee lookup. Missing/hidden references share an unavailable state. Only safe not-found is absorbed; database failures propagate. No sensitive profile lookup, new permission or account assignment is introduced.

Test actual service park/team/self/none, principal mismatch before lookup, exact query predicates and response keys, unavailable/inactive relationships and saved date. Real PostgreSQL tests exercise the existing recursive organization SQL and ORM lookups, including position organization mismatch. Optional isolated schema clones table structure only, adds synthetic fixtures, drops its own random schema and verifies cleanup; it does not prove migrations or modify retained import rows.
