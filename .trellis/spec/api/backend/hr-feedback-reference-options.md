# 360 operational reference pages

## 1. Scope / Trigger
Legacy options cap both employees and subjects at500 and cannot serve a complete operational directory. New bounded reads preserve existing write authority, scope, eligibility and anonymous-result rules. A cycle still has a500-person business limit; that does not limit searchable directory reach.

## 2. Signatures
GET /hr/feedback360-v2/employee-options?page=1&page_size=20&keyword=<literal name/code>.
GET /hr/feedback360-v2/subject-options?page=1&page_size=20&keyword=<literal name/code/cycle>&purpose=nominate|publish.
GET /hr/feedback360-v2/cycle-options -> {models,questionnaires}.

## 3. Contracts
Employee candidates require CYCLE_MANAGE or NOMINATE. Cycle metadata requires CYCLE_MANAGE. Subject controller allows NOMINATE or RESULT_PUBLISH, but service requires the exact requested purpose atom. All reject foreign principal tenant/park before SQL, including super. Existing access precedence and managedOrgSql apply unchanged. Active, undeleted scoped employee candidates preserve the original self/current-manager/same-org/direct-subordinate relationship scope. Subject predicates reuse original scoped joins and self/managed-tree restrictions, with statuses nominating/responding for nomination or responding/closed for publication.

Strict scalar decimal integer page1..2147483647, page_size1..100, default20; optional trimmed keyword max100. Unknown/repeated/array/boolean/exponent/hex query values reject through Nest ValidationPipe. Name/code/cycle search is parameterized ILIKE with backslash/percent/underscore escaped. Count and page share a REPEATABLE READ transaction and identical filtered query. Stable employee_code/id or cycle-time/cycle-id/employee-code/subject-id order.

Employee response: {items:[{id,employeeCode,fullName}],total,page,page_size}. Subject response items: {id,cycleCode,cycleName,employeeCode,subjectName,status}. Required audit records fieldGroups/projection/itemCount/route without keyword or personal values; failure rejects response, including empty pages. Cycle configuration options do not read employee/subject directories. Old options remain compatible, including original projection and cap. No environment keys, schema, seed or role changes.

## 4. Validation & Error Matrix
Malformed pagination/purpose/unknown query ->400 before SQL. Missing atom or foreign scope ->403 before query/transaction. Query failure ->no partial response. Audit failure ->no successful response. Search miss/out-of-range page ->empty items with full filtered total. Unknown purpose never falls back to a weaker permission. Existing nomination relationship and final transactional qualification checks remain authoritative; collaborator remains unavailable without its missing authoritative source.

## 5. Good/Base/Bad Cases
Good: a cycle manager searches employee601 without generic employee READ; a publisher reaches subject602. Base: self sees only own target subjects, while reviewer candidates retain established relationship scope. Bad: remove LIMIT and fetch every row, use employee READ to bypass exact operation authority, or allow NOMINATE-only to request publish purpose.

## 6. Tests Required
Actual service/controller/ValidationPipe tests cover exact atoms/purpose, foreign super, minimal projection, scoped predicates, stable bounds, literal escaping and metadata audit failure. HR_FEEDBACK_OPTIONS_PG_REQUIRED=1 permits only127.0.0.1:15487, random owned disposable DB. Query fixture verifies606 employees/602 operational subjects across31 pages, employee601 search, literal metacharacters, organization-tree/self ranges, foreign/deleted/departed exclusions, empty-page totals and concurrent insert snapshot consistency. Finally drop DB and stop the owned container. This is query-contract evidence, not full migration, production or business acceptance.

Modern page consumers use cycle-options only for cycle managers, bounded employee/nomination reference pickers only in their authorized forms, and publish-purpose subject pages only for publishers. Review-only reads no directory or cycle metadata. Selected verified rows survive pages, search and failed writes, while current candidate read failures disable form submission until recovery. Existing final write transactions revalidate references. Publication actions validate the current usable page; successful writes close the draft before any refresh warning. Original unknown-result same-key/same-payload retry and identity remount remain required.

Consumer tests cover cross-page employee selection including601, independent failed candidate recovery, publication refresh failure, malformed/duplicate pages, superseded search cancellation and the500-per-cycle limit. Actual component desktop/390px checks use explicit synthetic data and do not count as production or real-role acceptance.

## 7. Wrong vs Correct
Wrong: treat legacy options.employees/subjects as a full directory or count on a separate changing snapshot. Correct: call exact bounded operation reads; hold only verified selected references across candidate pages; revalidate final writes through the existing domain transaction. Cycle metadata must load independently of employee/subject reads.
