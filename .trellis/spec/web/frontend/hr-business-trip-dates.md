# Approved business-trip date continuity

- Attendance operators may correct approved business-trip start/end through `BusinessTripDatesPanel`; preserve person, approval, source evidence and declared days.
- Use shared form/Design System surfaces. Inputs are Shanghai local time, minute precision, valid calendar values, strictly increasing, at most 31 days. Unsupported historical seconds must not be silently truncated.
- Send scoped version and reason to `POST /hr/attendance/requests/:id/business-trip-dates`. Preserve the exact idempotency key/body after uncertain transport results; reject mismatched receipts and require refresh after a version conflict.
- Paginate the complete immutable history through `business-trip-dates-history`; late responses must not overwrite a different request, auth scope or unmounted panel.
- After success update row dates/duration/version immediately. A failed period refresh must retain the saved-success notice and actionable queue warning.
- Approved trip recalculation must accept the complete server plan, including historical affected dates across successive edits. The 33-day guard for other request kinds must not truncate that plan. Daily/month source-version checks remain authoritative.
- Validate actual components at desktop and 390px, preserving touch controls and no horizontal overflow. Synthetic browser fixtures are not production-role acceptance.
