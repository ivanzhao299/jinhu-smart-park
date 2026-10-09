# Validation

Candidate source based on explicit PR911 dependency7c3636e08; new slice only, no import replay.

- Talent interactions19/19; complete shared picker integrated suite50/50; reward/probation32/32 after preserving original probation callback projection.
- Web HR contracts230/230. API existing talent+candidate contracts12/12. Real PostgreSQL602 active rows over31 pages,601 exact search, literals, subtree/self/empty ranges and database cleanup1/1.
- Web/APItypecheck and affected ESLint pass (final validation recorded in artifacts); initial local test exact-text locator corrected, PG implicit-any fixed with typed endpoint return projection; no suppressed checks.
- Actual full HrTalentClient browser synthetic API: desktop1275=scrollWidth1275, mobileiframe390/document385=scrollWidth385, visiblebuttonsmin44. Cross-search selects1+601; simulated candidate read failure retains both selected records. Browser screenshot explicitly local synthetic, not production/UAT proof.
- NoDDL/auth grants/payroll mutations/production business fixtures. Full production release and real business UAT remain independent acceptance.
