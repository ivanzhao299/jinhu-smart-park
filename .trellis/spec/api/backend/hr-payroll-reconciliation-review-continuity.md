# Payroll reconciliation review continuity

## 1. Scope / Trigger
Expose existing run/person/item review actions in the modern payroll difference workspace, with append-only history. This does not establish actual period completeness, source-rule equivalence, formal payslip generation or payment.

## 2. Signatures
GET `/hr/payroll/reconciliations/:id/review-actions?page=1&page_size=20` returns `{items,total,page,page_size}`. Page size is bounded to100. POST on the same path retains `decision/comment/resultId?/itemDifferenceId?`, HTTP idempotency and original transaction locking. Web adapter `payrollReconciliationReviewActions(id, token, page, pageSize, signal)`; write adapter accepts caller key and signal.

## 3. Contracts
Existing reconciliation read authority applies before any query. Scoped run existence, count, rows and required metadata audit share one consistent transaction. History is ordered by original sequenceNo and stable action id, and projects only id/sequenceNo/decision/comment/createdAt/target IDs and safely scoped employee/item business labels. Item-only historical actions resolve their parent result without inventing an employee. Unknown/deleted associations remain unavailable; historical inconsistencies must not masquerade as a valid target.

Person/item reviews append evidence only. Whole-run accept/reject retains accepted/rejected terminal behavior; request_follow_up remains review. Neither a displayed opinion nor a successful POST changes original calculated amounts or silently approves source rules.

Web presents actual server statuses and hides terminal writes. Controlled trimmed comments and exact targets bind one current retry key; editing releases that attempt. Synchronous mutex rejects double submit; permission/scope/run/unmount change aborts stale work. Persist matched server write receipt before refreshing reads; read failure offers read recovery and never another write disguised as refresh. Keep history paging and read failures independent from the draft. Retain the existing desktop-only simulation/review boundary and phone preparation surface.

## 4. Validation & Error Matrix
Missing reconciliation authority:403 before probes. Missing scoped run/target:404. Terminal append:409. Cross-run/cross-scope item:reject and insert no action. Both resultId and itemDifferenceId supplied:400 before SQL, preserving the existing mutually exclusive target constraint in000250; item-only requests resolve their scoped undeleted parent. Invalid page bounds/comment/decision:DTO failure. Required read audit failure:rollback/no successful data response. Missing labels:unavailable, never a guessed record.

## 5. Good / Base / Bad Cases
Good:review one person's one project, then browse beyond the first history page while batch remains review. Base:whole-run accept preserves immutable terminal behavior and suppresses additional submission. Bad:cross-run IDs, another park, deleted result, stale context, lost response with a new retry key, or accepted batch labelled review.

## 6. Tests Required
Real disposable PostgreSQL:>20 actions, stable pagination/count, item-only historical target resolution, wrong tenant/park/run denial, deleted parent denial, exclusive targets and same-run item parent, person/item nonterminal, whole terminal, required audit rollback. API adapter/controller tests bind existing authority and key/signal. Actual client tests:target bodies, history pagination/negative reads, exact retry, edited attempt, terminal controls, committed write followed by read failure, stale response cancellation. Browser desktop and390px must show true business boundary; synthetic evidence is not production-role acceptance.

## 7. Wrong vs Correct
Wrong:show every run as复核中, accept a whole batch after a single-item opinion, generate a new key after an unknown response, or report write failure when history reload fails. Correct:use server status, preserve target granularity and append-only sequence, retry the exact unknown request and independently recover reads after a matched receipt.
