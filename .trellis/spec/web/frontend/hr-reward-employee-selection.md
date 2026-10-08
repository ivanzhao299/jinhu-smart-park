# Reward employee and draft continuity

## 1. Scope / Trigger
Modern reward case creation and category/draft editing must preserve business continuity across imported and newly entered formal employees.

## 2. Signatures
`HrEmployeeSelection` purpose reward consumes `hrApi.rewardEmployeeOptions(page,keyword,token,signal)`; parent submits selected original ID through hidden employeeId. Independent `rewardCaseOptions` returns categories.

## 3. Contracts
Reward purpose requires HR_REWARD_MANAGE; other shared selection purposes retain their existing permissions and qualification rules. Page20 and literal search; validate array/ID/code/name/page/size/total/cardinality/duplicates before publishing. Retain selected ID and visible label across pages/search/outage; failure owned retry without clearing other projections.
Key entire workspace by complete authenticated context; abort/ignore old candidate/category/case requests after identity/scope/authority change. Operation-only actors load operation candidates/categories without case READ APIs. Independent options and list failures remain separate.
Explicit submit events preserve all failed forms; synchronous busy ref prevents duplicate writes. Confirmed success resets only submitted form and case selection. Category refresh outage retains previous successful options and native selection; creating another record/category preserves an unrelated open edit draft. Update/action refresh still clears its submitted detail. Refresh failure after committed mutation is a separate warning, never falsely describes committed write as failed.
Shared DS surfaces plus scoped record-layout CSS display desktop records and390px cards without horizontal overflow or vertical text squeezing. Existing field/action permissions, attachment components and approval behavior retained.

## 4. Validation & Error Matrix
Invalid candidates -> owned error/retry; selection retained. Category outage -> retry while form remains. Failed create/update -> browser draft retained. Context change -> all projections/drafts reset; obsolete response ignored. Committed write + refresh outage -> success plus refresh warning.

## 5. Good/Base/Bad Cases
Good: search/select601 and retry save with same ID/code/summary. Base: earlier cases remain visible during candidate outage. Bad: reset failed form, lose off-page selection, use read authority for manage options, report a committed save as failed.

## 6. Tests Required
Actual component selection/search beyond500, candidate and category isolation, failed create/update drafts, context reset, duplicate prevention, committed-save refresh outage, malformed React-child containment. Shared lifecycle selection regression, protected upload/permission contract, desktop and390px rendered checks.

## 7. Wrong vs Correct
Wrong: React action catches rejected mutation then implicitly resets draft. Correct: prevent default and reset only after confirmed mutation success; refresh errors remain separate.
