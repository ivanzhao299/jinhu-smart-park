# Talent employee options

## Scope and API

GET /hr/talent/employee-options?page=1&page_size=20&keyword=<literal name/code> replaces the Web dependency on the compatible options endpoint capped at500. Preserve original active-only eligibility and talent park/managed_org_tree/self predicates. This does not change profile history limits, position options or a single meeting ArrayMaxSize500.

## Authority and validation

Controller matches options read/profile-create/review/succession-manage/development-manage atoms. Service independently checks those same atoms and actor tenant/park before SQL; unrelated employee READ, succession READ alone and development self-action alone do not authorize the candidate route. Existing wildcard/super rules apply. Page scalar decimal integer1..2147483647, size1..100(default20), trimmed optional keywordmax100; reject arrays, booleans, exponent, hex, blank/null pages and unknown properties through ValidationPipe.

## Data contract and errors

Response in existing API envelope: {items:[{id,employeeCode,fullName}],total,page,page_size}. Count/page share bound tenant/park/status/deletion/organization-tree/self/search filters. Escape percent/underscore/backslash before bound ILIKE; stable employee_code,id order. Required existing read audit has identity group, scope projection and returned count; no keyword or employee values. Audit failure prevents successful response. Empty/out-of-range page retains complete filtered count. Foreign scope/unauthorized fails403 before queries; invalidquery400 before SQL.

## Cases and verification

Good: authorized operator selects601 without acquiring employee READ; team only sees managed subtree; self sees own user-linked active employee. Bad: options first500 treated as complete directory, native multi-select drops off-page IDs, or a separate generic employee endpoint widens scope.

Unit tests exercise controller/service/DTO/HTTP validation/audit failure. Opt-in HR_TALENT_OPTIONS_PG_REQUIRED=1 requires owned loopback15482 disposable random database,602 rows over31 pages, literals, disabled/deleted/departed/foreign exclusions, managed descendant and self scopes, and verifies database cleanup. Query fixture is not migration or business acceptance. No new env requirement in production,DDL,import or write rule changes.
