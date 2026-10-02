# HR insurance loaded-page amounts

- API insurance amounts are exact decimal strings with at most two decimal places. Keep the display path in string/integer cents; never sum with `Number`, `parseFloat` or floating point `toFixed`.
- `loadedEmployeeAmount` owns the insurance page's loaded-record total. Accept whole and one/two fractional digits, retain signed values exactly, emit two digits and normalize negative zero. Do not round unexpected higher precision silently.
- An absent, null or malformed amount invalidates the aggregate display (`—`); do not exclude the row or infer a zero. An empty loaded page remains `0.00`.
- The KPI means only the currently loaded page, not every filtered record. Preserve its label and amount-permission gate; a response containing amounts does not grant permission to render them.
- Compose shared `ds-kpi-grid`/`ds-kpi-card` styles. At phone widths the amount card spans the local two-column overview, keeping large exact totals legible. Scope layout exceptions to insurance; do not restyle other HR pages.
- Verify decimal boundaries above `Number.MAX_SAFE_INTEGER`, cancellation, negative zero, malformed/missing input, actual component rendering and hidden-amount roles. Check actual component/CSS with synthetic data at desktop and390px; explicitly distinguish fixture evidence from production auth/role acceptance.

References: `apps/web/app/hr/insurance/insurance-amount.ts`, `insurance-amount.spec.ts`, `HrInsuranceClient.tsx`, `insurance.module.css`, and `apps/web/test/interaction/hr-insurance-exact-total.test.tsx`.

## Reference preview surface

- `/hr/insurance/preview` requires park insurance read, amount read and employee read, in addition to the HR page/module gate. Its ledger link uses the same permission intersection.
- Fetch policy metadata with scoped server pagination and existing employee catalog; independent searches/pages invalidate their selected relation. No implicit policy, employee, variant, fund choice, current month or zero base.
- Obtain kind IDs from policy catalog. Keep money inputs as strings; only year/month/version/variant metadata may use Number. Require all six explicit bases.
- Employee or period changes clear bases. Any calculation-input change clears results and cancels prior requests. Remount on identity, tenant/park, permission or field-policy changes; late callbacks must not revive old sensitive data.
- POST through the shared API helper with an action key for the global guard. This ephemeral reference endpoint does not provide durable replay or confirmation.
- Compose shared surfaces and local spacing. Nested selector panels need their own inner spacing. Result cards remain visible on desktop and390px; use scoped selector specificity rather than relying on CSS load order.
- Test explicit inputs, exact large decimal transport, fund exclusion, independent totals, relation paging, cancellation, context revocation and key transport. Browser fixture validation covers actual component/CSS, not production JWT or real-role acceptance.
