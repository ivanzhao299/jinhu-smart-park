# Training operation employee candidates

## 1. Scope / Trigger

Training plan creation must reach the full current-scope employee directory beyond the legacy 500-row options cap, preserving existing write eligibility and permissions.

## 2. Signatures

- `GET /hr/training/employee-options?page=1&page_size=20&keyword=<literal name/code>`.
- `GET /hr/training/course-options`.

## 3. Contracts

`GET /hr/training/employee-options` requires exact `hr:training:plan:manage` (existing super/wildcard accepted), never training READ or generic employee READ. Service rejects mismatched actor tenant/park before querying. Strict scalar decimal integer page defaults1, max2147483647; page_size defaults20, max100; trimmed optional literal keyword max100. Repeated arrays, boolean, exponent, hexadecimal, blanks and null pages reject.

Candidates retain the existing preboarding/probation/active/suspended eligibility and current tenant/park, excluding deleted rows. Name/code LIKE search escapes backslash, percent and underscore with bound parameters. Stable code/id order, count and minimal id/employeeCode/fullName projection. Required metadata audit exposes field group, route, projection and count, never keyword or employee values; audit failure prevents response.

`GET /hr/training/course-options` has the same exact authority/scope and returns enabled course options independently of employee queries. Existing plan-options and createPlan qualification rules remain compatible. The new UI calls the independent course and candidate endpoints, loads operation options with PLAN_MANAGE even without READ, and never requests plans without their read permission.

Employee response inside the standard API envelope is `{items:[{id,employeeCode,fullName}],total,page,page_size}`. Course response is `{courses:[{id,title,hours}]}` with decimal hours text. No new production environment keys or schema.

## 4. Validation & Error Matrix

- Invalid scalar/bounds/keyword or unknown query property -> HTTP400 through the real Nest ValidationPipe before SQL.
- Missing exact permission or principal tenant/park mismatch -> HTTP403 before queries.
- Search miss or out-of-range page -> empty items and the complete filtered count; deleted/departed/foreign rows never appear.
- Required candidate audit failure -> no successful response, including empty results.

## 5. Good/Base/Bad Cases

- Good: a PLAN_MANAGE-only actor searches and selects employee601 without READ.
- Base: an already selected employee remains submitted across later candidate pages.
- Bad: widen options using generic employee read, silently cap the directory at500, or interpret a repeated query array as one page.

## 6. Tests Required

Validate DTO/permission/scope/audit and real PostgreSQL 601+ rows, all four statuses, literals and stable paging. `HR_TRAINING_OPTIONS_PG_REQUIRED=1` permits only loopback15482 in an owned disposable database; random database cleanup is required. This query fixture is not migration acceptance.

`hr-training-employee-options.spec.ts` covers exact controller metadata, direct service fail-closed behavior, minimal projection, required audit and real ValidationPipe whitelist/bounds. The opt-in PG spec checks602 rows across31 pages without duplicates and asserts database removal.

## 7. Wrong vs Correct

- Wrong: `Number(query.page)` accepts an array; `planOptions.employees` is treated as the complete directory.
- Correct: validate scalar decimal integers with explicit bounds, then count and page using the same scoped predicates and stable code/id order.
