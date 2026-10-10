# Validation checkpoint

Root completed all source and tests; independent read-only review passed after fixing mismatched receipt identity. Final focused contract suite: 51 passed. Final HR regression: 242 passed. Web typecheck and focused lint passed. Local Web build passed; final 44px CSS adjustment was made during that build, so CI must establish the final candidate build.

Local browser synthetic acceptance: desktop 1275/1275 and phone 385/385 scroll/client widths, no horizontal overflow; visible buttons at least 44px. Unknown result retries retain the original key, known success retains business receipt through failed list refresh, read-only refresh clears the warning. Screenshots and source hashes are in the private artifact directory. These are synthetic checks, not production business acceptance.

Predecessor PR #934: production deploy 38030607627 and independent observer 38031725714 succeeded; API and Web actual revision 7d5a428ea50278f230e6ddbcb98fd758842f43c3. Docker cleanup completed. No production HR test writes, DDL, permission or payroll-rule changes.

Remaining: final CI, merge/deployment/runtime verification; real user contract acceptance and original Windows/GroupWeb equivalence are separate and incomplete. Payroll rule owner is Wu Enguo; use latest complete real data, calculate only, no payment.
