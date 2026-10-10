# Validation and acceptance boundary

Baseline: latest main 0949a5e9a8ccf7fdf05ce59b34192e823f8a2784 (PR933), integrated before final checks. Scope: source-period metadata query and existing reconciliation preparation UI; no DDL/import replay/production payroll write.

- API focused source contract: 16 passed; Web source-preparation interaction: 9 passed.
- Real PostgreSQL16: full migration chain passed; 5 integration cases passed (existing source/insurance plus month counts/paging and receipt/scope/schema constraints). Root-owned isolated container and volume removed. API service and PG test hashes unchanged across run. PR933 has no migration changes.
- API/Web focused ESLint and TypeScript: passed. One added synthetic batch initially lacked createdAt; corrected fixture and reran Web typecheck/tests/lint.
- Existing HR Web regression: 240 passed.
- Independent full-slice read-only review: no actionable findings; source permissions/audit/scoping/counting/paging, UI context cancellation and schema-faithful tests reviewed. Parent owns executed verification.
- Actual source component plus global/module CSS compiled with before/after SHA256 equality. In-app browser: 1280px desktop, 390px phone (body385,scroll385); month list visible,51month pagination, second page2022-08 selecting existing preview198records/198employees/1188items. No freeze invoked. Screenshots and build hashes are private local synthetic artifacts, not production-data proof.
- git diff --check and Trellis task context validation passed.
- API/Web production build: passed. Existing unrelated CSS autoprefixer and Next ESLint-plugin warnings remain.

Actual payroll month/rules/amounts and role UAT remain unverified. 吴恩国 confirms latest complete actual production period, tax, attendance deductions/supplements and social-insurance rules. Latest observed month alone is not completeness. Preparation remains 只算不发; no formal payroll/payslip/payment or role provisioning. Login-dependent business evidence does not block independent development/release.
