# Formal per-detail appraisal

## 1. Scope / Trigger
Optional explicit detailAppraisalPolicy in the frozen workflow enables narrative editing on each independent detail in normal five-channel operations. Old workflow/input JSON remains unchanged when absent. This is a full normal field capability, not source activation/receipt qualification or payroll acceptance.

## 2. Signature
policy.detailAppraisalPolicy:HrPerformanceMasterPolicy and appealReviewAllowed.detailAppraisal:boolean|null are paired optional keys. Every enabled input detail has appraisal:HrPerformanceInputCell. PATCH uses field detailAppraisal with exact independent detailId and current revision CAS; never a main appraisal replacement or item-based merge.

## 3. Contracts
Editor enables an unconfigured policy explicitly; never guess stage/actors. Disabling removes both optional keys. Published versions remain immutable. Existing captured attempts and dualCAS remain unchanged. Reuse shared policy fields and business label 明细评语, include complete history authority and appeal settings.
Current/history preserve independent notes and missing cells. Missing note means unavailable projection, never null or UNPROVIDED. A server writable-note receipt must correspond to an actual visible note on the frozen enabled policy and exact detail ID. All details remain paged/reachable, repeated items are independent.
Narrative is up to200 Unicode codepoints including astral characters. Browser maxLength400 is the UTF16 upper bound; show the codepoint count, aria-invalid above200, and enforce shared validator before save. Never silently trim. Required/NULL/stage and actual role rules remain backend-authoritative. Notes must never enter scoring or salary carriers. Policy/body and request key retention follow existing operation continuity.

## 4. Validation / Errors
Unexpected enabled input under old policy, forged allowedFields targeting a hidden note, duplicate/unknown detail, malformed or >200-codepoint note fails. Required blank/NULL and out-of-stage writes cannot advance business. Preserve user text on rejection; current/historical views use exact server projection.

## 5. Good / Base / Bad
Good: two detail IDs share one item and retain separate text/reasons; notes remain editable only in configured stage. Base: no policy produces no new field or implicit defaults. Bad: merge by item, infer a reviewer, turn a hidden note into empty text, use maxlength200 to reject valid200-astral-character text, or report notes as source approval.

## 6. Tests
hr-performance-detail-appraisal.test.tsx covers distinct notes, all21-detail paging,200astral/201 rejection, masked omission, old policy, readonly historical notes, enable/disable and historical policy settings. Existing full workflow suite32cases covers normal operation/attempt/late response foundations. Run focused suites, Web lint/typecheck/build and actual native desktop390px after serial review. Real PG/HTTP, CI/runtime and real-role acceptance remain distinct evidence.

## 7. Wrong vs Correct
Wrong: click a same-named action before async record options are loaded. Correct: await the actual target record/option and use a scoped semantic action. Wrong: report source drafts or notes as full parentD completion. Correct: preserve complete link/receipt/initialization and real-role business acceptance.
