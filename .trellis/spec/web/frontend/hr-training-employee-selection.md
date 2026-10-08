# Training employee selection continuity

## 1. Scope / Trigger

Applies to the training plan multi-employee picker and independent operation-option reads.

## 2. Signatures

`TrainingEmployeePicker({selected,onChange,disabled})` consumes `hrApi.trainingEmployeeOptions(page,keyword,token,signal)`; plan submission retains `employeeIds` derived from hidden `employees` FormData values.

## 3. Contracts

TrainingEmployeePicker uses a search box, touch checkbox list, paging20 and an explicit removable selected collection. Cross-page/search selections survive query failure, deduplicate by ID, cap500, and serialize hidden `employees` values through the existing createPlan FormData contract. Empty selection blocks submission. Candidate requests abort on changes/unmount and ignore stale responses. Render shared DS records on desktop and phone with scoped layout-only CSS.

Courses load independently from employee candidates. PLAN_MANAGE-only actors may create plans without acquiring READ; partial ancillary failure retains successful task/course projections. Course/plan forms use explicit submit events so rejected mutations retain browser drafts; reset only on confirmed success. Key the entire training workspace by the complete authenticated user context to clear forms, selections, errors and in-flight projections on identity/scope/authority changes.

Validate each successful candidate payload before publishing it: exact requested page, page_size20, nonnegative safe integer total, at most20 rows, nonblank string IDs and string code/name. Reject the whole malformed page; explicitly project valid rows and deduplicate by ID. Do not let a malformed React child crash the workbench or accept an oversized response as a normal page.

## 4. Validation & Error Matrix

- Empty selection -> visible error and no plan request; adding employee501 to an existing500 selected -> refuse addition with visible limit feedback.
- Candidate read failure/malformed payload -> visible retry, no new candidates, existing selected hidden values retained.
- Older response or unmounted identity context -> ignored; changed user/scope/permissions -> fresh forms and selections.
- Failed course/plan creation -> retained fields; confirmed success -> reset submitted form and plan selection.

## 5. Good/Base/Bad Cases

- Good: choose1 and601 across searches, remove1, submit only original601 ID.
- Base: selected rows survive a later candidate outage.
- Bad: native multi-select makes off-page selections disappear, malformed names enter JSX, or a course-only operator calls training read APIs.

## 6. Tests Required

Test cross-page/search retention, removal/unique fields/max500, abort/stale response, operation-only authority, candidate failure independent of plans/courses, failed course/plan drafts, and full context reset. Verify desktop and390px rendered UI separately.

Interaction regressions also cover malformed rows/count/page/cardinality, retry recovery/deduplication and course-only requirement options without read/plan APIs. Preserve existing result-maintenance tests when shared client loading changes.

## 7. Wrong vs Correct

- Wrong: `setItems(result.items)` publishes unchecked values or replacing selected with the current page.
- Correct: validate/project the candidate response; keep selected state independent and clear it only after confirmed success or context reset.
