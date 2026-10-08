# Contract operation employee candidates

Contract forms use the existing scoped `/hr/employees` directory with 20-row server keyword search and pagination. Do not scan every employee page on opening the contract page. Only mount the selection when creating, editing or reviewing a contract; load contract types independently.

No new authority is granted. Directory queries need existing employee park/team read authority. If unavailable or a query fails, retain the employee already returned by the contract detail so the same formal contract can still be maintained. New choices are preboarding/probation/active; departed/suspended options cannot be newly selected. Existing contract lifecycle validation remains server authoritative.

Require an explicit selected ID before saving. Retain deliberately selected identities across page/search changes and never select the first result. Validate returned pagination metadata, abort replaced/unmounted requests and reject late responses. Key the form selector by complete authenticated context and form/contract identity; context changes remove candidate rows and the selected contract form.

Use DS form fields/buttons and layout-only route CSS: wrapping controls, 44px buttons, two fields on desktop and stacked fields at390px. Verify actual component rendering without overflow. Synthetic page evidence is not production role acceptance.

Regression: employee101 on page6, bounded lazy loads, Enter search without parent submission, retained target after search/error, inactive target rejection, wrong/shrinking pages, replaced/unmounted requests, actual create payload, original employee/type preservation after directory denial/failure, account/permission/park context changes. No source recipe, schema or backend write change.
