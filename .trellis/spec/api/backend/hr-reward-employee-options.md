# Reward operation employee candidates

## 1. Scope / Trigger
Modern reward case creation must reach the scoped employee directory beyond the compatibility options limit500. No migration or change to reward approval, finance or write eligibility.

## 2. Signatures
- `GET /hr/rewards/employee-options?page=1&page_size=20&keyword=<literal name/code>`.
- `GET /hr/rewards/case-options`.

## 3. Contracts
Both endpoints require exact HR_REWARD_MANAGE (existing super/wildcard accepted), and actor tenant/park must match scope before SQL. Employee query reuses strict validated training paging DTO metadata: scalar decimal page1..2147483647, size1..100 defaults20, optional trimmed keyword max100, whitelist rejection.
Same scoped predicates for count and page; preboarding/probation/active/suspended only, exclude deleted/foreign rows; bound literal ILIKE escapes backslash/percent/underscore; stable employee_code/id order. Minimal id/employeeCode/fullName projection, no generic employee READ dependency. Required metadata audit records identity field group, route, projection and item count, no keyword/row values.
Case options independently return enabled current-version categories only. Compatibility categories/options retain existing read permission and capped query. New UI uses independent operation endpoints. Standard response bodies: `{items,total,page,page_size}` and `{categories}`.

## 4. Validation & Error Matrix
Malformed scalar/bounds/unknown query ->400 before SQL. Missing exact authority or actor/scope mismatch ->403 before SQL. Empty/out-of-range search returns full filtered count and empty items. Audit failure prevents candidate response.

## 5. Good/Base/Bad Cases
Good: MANAGE-only actor searches employee601 without READ. Base: category failure does not remove employee selection. Bad: broaden generic READ, accept query arrays, silently use capped legacy options.

## 6. Tests Required
Real ValidationPipe inheritance, controller authority, direct-service scope, minimal projection, required audit, escaped searches. Opt-in `HR_REWARD_OPTIONS_PG_REQUIRED=1` allows only owned loopback15484 fixture;602 rows across31 pages, all four statuses, foreign/deleted/departed exclusion, enabled-category scope and literal searches. Random database cleanup required; query fixture is not migration acceptance.

## 7. Wrong vs Correct
Wrong: employee arrays from old options treated as the complete directory. Correct: independently authorize/count/page candidates and load enabled categories.
