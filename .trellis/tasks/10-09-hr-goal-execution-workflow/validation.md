# 验证与交付边界

- API focused tests: 6 passed (2 context + 4 existing T6 contracts).
- Isolated PostgreSQL: 1 passed, 0 skipped; scoped manager draft/parent/own-active checkin cases, foreign scope/deleted exclusions; temporary DB removed and lab stopped.
- API and Web typecheck/lint/build: PASS.
- Web actual-component interactions: 16 passed, including stable-key retry after unknown transport failure.
- HR regression: 222 passed, 0 skipped.
- Actual-component shared-CSS browser: desktop and 390px PASS; document scrollWidth385 <= viewport390; visible desktop ledger; 44px controls. Local synthetic API only.
- No schema/state-rule changes. Full state-machine PostgreSQL suite not repeated; focused query fixture does not replace real-role/month business UAT.
- Historical import not replayed; production business test writes 0.
- Legacy GroupWeb module mapping search: no goal entries. This is modern operations completion, not accepted legacy equivalence.
- Remaining: full goal terms/version-change editor; real-role/month acceptance; independent source-function parity and production cutover acceptance.
