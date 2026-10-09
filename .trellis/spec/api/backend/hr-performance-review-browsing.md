# Performance review continuous browsing

## 1. Scope / Trigger
Modern self/manager/HR evaluation browsing must remain usable for many employees and periods. This adds bounded review reads to the existing evaluation/acknowledgement/appeal workflow; it does not reproduce or certify all legacy scoring rules.

## 2. Signatures
GET `/hr/performance-v2/review-page`; RequireAnyPermissions READ/TEAM_READ/SELF_READ. HrPerformanceReviewPageQueryDto extends existing optional UUID cycleId and enumerated review status with integer page1..1000000 and pageSize1..100 (defaults1/30). Response `{items,total,pending,confirmed,page,pageSize}`. Web adapter performanceReviewPageV2(query,token,signal). Existing GET reviews remains an array for compatibility.

## 3. Contracts
reviewFilter supplies identical tenant/park, self or managed organization-tree and cycle/status conditions for both count and list. Count and page run under one REPEATABLE READ read-only transaction. Order start_date DESC, employee snapshot name, review UUID; summaries cover the entire filtered authorized set, even an empty out-of-range page. Only the page performs expensive submission/calibration/appeal projection. Reuse original projection; self sees no manager/calibration/final result until acknowledgement stage. Required sensitive-read audit succeeds before returning. Actions test the exact scoped review ID instead of fetching every review; premature self action history remains masked. No DDL or state/rule/payroll mutations.

Modern Web uses30 rows, cycle/status filters, server totals, and independent Abort/generation rejection. Query changes immediately clear rows/counts and old editor; writing synchronously blocks navigation/filter changes and duplicate submissions. Existing explicit forms retain failed inputs. Successful writes close completed editors and retain success when following read fails. Full auth-context key unmounts old projections/drafts. Cycles, templates and calibration lists retain existing contracts; this is not a claim that all configuration reads are bounded. Use shared DS; local CSS only for record text layout and44px touch sizes.

## 4. Validation & Error Matrix
Invalid page/size/status/cycle ->400. No direct-service scope capability ->403 without query. Foreign scope/object ->empty page or not-found action history. Required audit failure ->no data response. Failed read ->clear old rows and retry same page. Failed write ->retain scoring draft. Stale response ->ignored. Committed write plus read failure ->success plus separate error; no duplicate editor.

## 5. Good / Base / Bad Cases
Good: self traverses65 evaluations over3 pages with correct filtered totals and then evaluates a selected record. Base: old reviews array remains compatible. Bad: page-local counts masquerade as totals, return all reviews to the browser and slice them, or allow a late read to reopen a different employee draft.

## 6. Tests Required
DTO/route permissions, direct-service fail-closed; isolated PostgreSQL projection fixture proves self/team/park/foreign tenant/park, stable pages, empty tail, status/cycle totals, actual hidden submission/calibration, exact-ID history masking, audit failure and a concurrent insert between count/list under snapshot isolation. This fixture intentionally does not substitute for original full-schema lifecycle tests. Actual component tests cover paging/filter/race/error retry, writer lock/duplicate submit, zero-score failure retention, committed+refresh failure, context reset, no-read no-query. API/Web lint/typecheck/build and HR regression; actual synthetic desktop/390px screenshots. Real production role UAT remains separate.

## 7. Wrong vs Correct
Wrong: count first and query later on separate snapshots, or use reviewRows across the whole tenant to authorize one history request. Correct: count/page share a read snapshot and scope builder; history reads exactly one authorized target. Wrong: label loaded-row length as complete pending total. Correct: display server-filtered pending/confirmed counts and page metadata.
