# HR insurance loaded-page amounts

- API insurance amounts are exact decimal strings with at most two decimal places. Keep the display path in string/integer cents; never sum with `Number`, `parseFloat` or floating point `toFixed`.
- `loadedEmployeeAmount` owns the insurance page's loaded-record total. Accept whole and one/two fractional digits, retain signed values exactly, emit two digits and normalize negative zero. Do not round unexpected higher precision silently.
- An absent, null or malformed amount invalidates the aggregate display (`—`); do not exclude the row or infer a zero. An empty loaded page remains `0.00`.
- The KPI means only the currently loaded page, not every filtered record. Preserve its label and amount-permission gate; a response containing amounts does not grant permission to render them.
- Compose shared `ds-kpi-grid`/`ds-kpi-card` styles. At phone widths the amount card spans the local two-column overview, keeping large exact totals legible. Scope layout exceptions to insurance; do not restyle other HR pages.
- Verify decimal boundaries above `Number.MAX_SAFE_INTEGER`, cancellation, negative zero, malformed/missing input, actual component rendering and hidden-amount roles. Check actual component/CSS with synthetic data at desktop and390px; explicitly distinguish fixture evidence from production auth/role acceptance.

References: `apps/web/app/hr/insurance/insurance-amount.ts`, `insurance-amount.spec.ts`, `HrInsuranceClient.tsx`, `insurance.module.css`, and `apps/web/test/interaction/hr-insurance-exact-total.test.tsx`.
