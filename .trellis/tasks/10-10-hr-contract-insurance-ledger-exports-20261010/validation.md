# Validation — 2026-10-10

Base: edc84e80f9a32c64cdccc7f3ade4371ae5b2d888 (PR 907).

- Seven focused Web interaction files: 37 passed. Actual parent components, 101-row full pagination, exact employee transport, self/team/park field allowlists, captured token, cancellation, double-click mutex, failure/drift and 5000 cap.
- Existing HR Node regression including eight new CSV checks: 230 passed.
- Web typecheck and affected ESLint: passed; final presentation-only label changed to 社保台账.
- Actual components with synthetic transport and global CSS: desktop and 390px iframe inspected for both pages. Mobile document width=scrollWidth=385, insurance minimum button height44; UI CSV success observed for both contract and insurance. Screenshots outside repository under hr-contract-insurance-ledger-exports-20261010/browser.
- No historical import replay, production business writes, grants, schema or API behavior changes. Existing API optional abort transport extended only.
- Full build delegated to CI. No backend/real PostgreSQL checks: frontend-only export behavior, backend predicates unchanged. Real HR/team/employee UAT remains separate from synthetic browser evidence.
- Pagination validation is not an atomic database snapshot; same-count changes on un-rechecked middle pages can escape detection. No partial file on detected drift/failure. Maximum5000; large exports must narrow filters.
