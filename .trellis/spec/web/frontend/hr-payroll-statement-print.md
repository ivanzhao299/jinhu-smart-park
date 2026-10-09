# Payroll statement printing

Only successful authorized payroll detail plus all item reads mount PayrollStatementActions. Reuse existing read APIs, business amount formatter and formatPayrollHistoryItemValue: preserve decimal strings, negative values, null/empty facts and attendance-day units. No calculation, publication, payment or extra read/write endpoint.

Print a single allowlisted current statement: month/account book, management-only employee code/name, gross/deduction/tax/net and every loaded item. Self projection omits identity even if unexpected identity appears in a response. React renders text, never inject HTML or raw payload/internal IDs/source tables/mapping states.

Use existing global print-area/table/page styles. Body-level portal prevents clipped ancestor layouts. Route-local print rules exclude all other body children, use white paper and repeated table headers, preserve long wrapping rows; screen sees only a min44px DS button. No popup, external document service or new button system.

HistoryPayroll key binds complete authenticated user context; scope/permission changes synchronously unmount the previous statement and abort outstanding requests. Existing generation/abort removes old paper on new detail, applied filters, pagination, close and unmount. Error/denial/loading cannot retain a printable old wage. Original-target retry remains available.

Verify full payroll component success/failure/retry, scope/permission change, stale requests and month query; standalone allowlist/self/escape/exact values/units/empty rows/print failure. Browser desktop and390px, plus exact compiled print rules rendered via a test-only screen-media preview. Preview proves CSS visibility/layout and all65 loaded rows, not actual PDF pagination, printer-driver success or real employee/HR acceptance. No full legacy report equivalence claim.
