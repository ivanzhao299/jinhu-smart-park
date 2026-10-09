# Talent profile complete history

## Scope and signatures

TalentProfileHistory({busy,refreshKey,onEmployeeCount}) independently uses existing useHrResource and hrApi.talentProfilePage(page,keyword,token,signal), page20. Parent no longer requests legacy500 profiles array. Only current talent read atoms mount it; write-only profile creation never silently gains read authority. Full authenticated context key unmounts old history/drafts.

## Behavior

Literal search with trimmed name/code, full filtered record count and distinct employee count, next/previous, same-page refresh/retry, and out-of-range reset1. Runtime payload validates page,size20, safe nonnegative counts, employeeCount<=total and positive if totalpositive, maximum20/total rows, stable unique nonblank IDs, strings/date fields, positive integer snapshotNo and nullable object source metadata before render. Malformed/read failure clears old records and marks count unknown, never zero by inference. useHrResource abort/generation/alive prevents stale publishing.

Resource independence: image read failure cannot clear review sessions/development; ancillary read failure leaves authorized profiles available. New frozen profile commit refreshes history once with current filter preserved; rejected write keeps employee/date drafts and does not refresh history. busy disables filters/paging/refresh while writer runs. Existing five form contracts and exact rights unchanged. KPI clearly labels current profile-query employee count; no page-local counting. DS panels/records/buttons, local layout only; desktop and390 controls44 and no horizontal overflow.

## Verification

Component tests cover paging/search/601/counts, failed page/same-page retry, stale response, malformed fields/counts/cardinality, commit refresh/failed write, lock, independent read error, context reset, readonly/write-only authority and empty/out-of-range results. Keep previous talent19 interactions passing and HR contracts230. Actual full client synthetic browser separately proves desktop/390 and error isolation; not production role UAT. API legacy compatibility and business source rule equivalence remain separate requirements.
