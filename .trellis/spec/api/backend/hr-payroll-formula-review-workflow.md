# Payroll formula review workflow

## 1. Scope / Trigger
Payroll simulation requires reviewed formulas. Rules operators must inspect the actual expression, separate condition and dependencies before making an explicit decision. Imported rules are maintained through the existing append-only review domain.

## 2. Signatures
GET /hr/payroll/history-formulas remains a bounded scoped list and adds business bookName only. GET /hr/payroll/history-formulas/:id adds bookName, versionNo, rawExpression, rawCondition, parserVersion, syntax and approvalEligibility. Existing POST :id/review accepts approve_for_simulation|reject plus reason.

## 3. Contracts
RULE_READ is required before queries and successful required metadata audit before return. All root/item joins and detail predicates retain tenant/park; deleted book/formula is excluded. Raw source expression/condition stay strings, preserving precision/null. Source hashes, staff, amounts and executable AST are absent. Reuse parsePayrollFormula; terminal reviews are terminal, unsafe AST or separate nonblank condition is blocked, otherwise syntax_ready is only an initial syntax check. Existing review endpoint retains dependency/ordering/conflict checks, append-only version, exact review authority, idempotency and body-free audit. No automatic review/payment/payslip changes.

## 4. Validation & Error Matrix
Missing RULE_READ ->403 before queries/audit; scoped missing ->404 with no detail; required audit failure ->no response. Existing POST rejects unsafe expressions, separate legacy conditions, terminal/dependency conflicts and missing review authority. A syntax-ready projection never replaces server write validation.

## 5. Good/Base/Bad Cases
Good: inspect current book's full source and explicitly supply review reason. Base: approved/rejected versions remain queryable, original record is unchanged. Bad: approve from a count-only card, execute legacy SQL, assume parser success proves business rules, or publish wages to enable comparison.

## 6. Tests Required
Actual service mock tests cover exact read authority, scoped joins/predicate, text precision, null/condition, dangerous expressions, terminal projection, missing row and required audit failure. Opt-in actual PostgreSQL on owned127.0.0.1:15489 random lab verifies query aliases/source text and foreign park isolation, drops its DB and removes container. Minimal read schema proves this query, not complete migration/review/real business acceptance. Existing parser/history contracts remain required.

## 7. Wrong vs Correct
Wrong: widen list projections to raw expressions/hashes and hide full detail on phone. Correct: raw rule text only on the authorized exact detail; independent Web work area offers all statuses/books, paged lists, explicit reason/decision and protected retry semantics. Real rules/month/amount acceptance remains separate.
