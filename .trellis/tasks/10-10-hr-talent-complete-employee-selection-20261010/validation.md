# Validation

Candidate source based on explicit PR911 dependency7c3636e08; new slice only, no import replay.

- Talent interactions19/19; complete shared picker integrated suite50/50; reward/probation32/32 after preserving original probation callback projection.
- Web HR contracts230/230. API existing talent+candidate contracts12/12. Real PostgreSQL602 active rows over31 pages,601 exact search, literals, subtree/self/empty ranges and database cleanup1/1.
- Web/APItypecheck and affected ESLint pass (final validation recorded in artifacts); initial local test exact-text locator corrected, PG implicit-any fixed with typed endpoint return projection; no suppressed checks.
- Actual full HrTalentClient browser synthetic API: desktop1275=scrollWidth1275, mobileiframe390/document385=scrollWidth385, visiblebuttonsmin44. Cross-search selects1+601; simulated candidate read failure retains both selected records. Browser screenshot explicitly local synthetic, not production/UAT proof.
- NoDDL/auth grants/payroll mutations/production business fixtures. Full production release and real business UAT remain independent acceptance.

## Integrated release candidate

- Integrated latest main a90b805910daebe8f97928a4e173e75ea93f8bd2 (PR911). Its whole tree equals validated dependency7c3636e08; resolved five squash-history conflicts only after proving stage3 equals the dependency, preserving new candidate changes.
- Bundled recruitment contact sourcefe727e5249a7705b65bec02db150253774a829ac; only parent children conflict, all other fields identical; union retains every task. Original worktree/branch preserved.
- Integrated107 interaction tests across9 files PASS, WebHR230 PASS, API/Webtypecheck PASS, affected Web/APIlint PASS. Talent API12 and realPG1 reused because exact source/input/runtime unchanged after integration; test database and owned container removed. Existing recruitment desktop/390 proof reused because all three relevant source files identical to independently validatedfe727e5.
- Talent desktop/390 browser screenshot mobile-selected.png shows IDs1 and601 retained; failure screenshot mobile.png shows retained selection after candidate outage. No horizontal overflow; min44px controls.
- Local production build left to one combined CI build; no duplicate standalone build. Release Smoke only if existing CI classifier requires it; noDDL,seed,env,workflow changes. Real user/month business acceptance remains outstanding.
