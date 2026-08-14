# PR192 Human UAT Task Cards

These cards are templates for external real-user execution. They state goals and allowed start points, but do not provide step-by-step product answers. The coordinator may localize labels and business examples, but any change to task wording must create a new `task_card_version` and cohort.

## Common Metadata

- `task_card_version`: `<fill-before-release>`
- `environment_id`: `<fill-before-release>`
- `build_sha`: `<fill-before-release>`
- `threshold_version`: `<fill-before-release>`
- `allowed_devices`: `desktop`, `phone_390px_class`
- `forbidden_assistance`: prefilled UUIDs, super-admin borrowing, host clicking for participant, step-by-step navigation answers
- `record_required`: success/failure, duration, interaction count, error count, help count, device, first/repeat marker, anonymized participant ID, evidence references, consent status

## Role Coverage Matrix

| Role | Minimum participants | Required tasks per participant | Device coverage |
| --- | ---: | ---: | --- |
| Park admin | 5 | 4 | Desktop plus at least one phone task in cohort |
| Homestay front desk | 5 | 4 | Desktop plus at least one phone task in cohort |
| Homestay cleaner | 5 | 4 | Phone-first required |
| Homestay inspector | 5 | 4 | Phone-first required |
| Homestay finance | 5 | 4 | Desktop plus recovery task |
| Housing leasing specialist | 5 | 4 | Desktop plus phone detail review |
| Housing approver | 5 | 4 | Desktop plus approval audit task |
| Housing handover staff | 5 | 4 | Phone-first required |
| Housing billing staff | 5 | 4 | Desktop |
| Cashier | 5 | 4 | Desktop |
| Finance approver | 5 | 4 | Desktop plus maker-checker task |
| Purchase requester | 5 | 4 | Desktop or phone |
| Purchase approver | 5 | 4 | Desktop |
| Payment staff | 5 | 4 | Desktop |
| Repair staff | 5 | 4 | Phone-first required |
| Auditor | 5 | 4 | Desktop plus permission-deny task |

## Task Templates

### PARK-ADMIN-01 — Verify role-scoped work entry

- Role: Park admin
- Start point: primary navigation after login
- Goal: find the property-business work entry assigned to the role, identify the available modules, and report any menu mismatch or missing page.
- Completion condition: participant can name the visible modules and identify one inaccessible area without using a superuser account.
- Recovery condition: if access is denied unexpectedly, participant records the page, message, and task ID.

### HOMESTAY-FRONTDESK-01 — Arrival to check-in readiness

- Role: Homestay front desk
- Start point: homestay dashboard or bookings queue
- Goal: locate a due arrival, verify guest/stay readiness, and prepare the booking for check-in according to local operating policy.
- Completion condition: correct booking state and visible next action are recorded.
- Recovery condition: if identity or stay data is incomplete, participant records the blocker and expected handoff target.

### HOMESTAY-CLEANER-01 — Turnover execution with evidence

- Role: Homestay cleaner
- Start point: assigned turnover task
- Goal: start a turnover, record completion details, and attach field evidence when required.
- Completion condition: turnover progress and evidence state are visible to the participant.
- Recovery condition: if upload fails, participant attempts the documented retry path and records the result.

### HOMESTAY-INSPECTOR-01 — Turnover exception review

- Role: Homestay inspector
- Start point: turnover detail or task queue
- Goal: review an exception, inspect evidence, and record whether follow-up is required.
- Completion condition: exception decision or follow-up blocker is recorded.
- Recovery condition: if evidence is not visible, participant records permission and file behavior.

### HOMESTAY-FINANCE-01 — Refund or waiver maker-checker request

- Role: Homestay finance
- Start point: homestay booking finance detail
- Goal: create a refund or waiver approval request only when source ledger, amount, permission, and reason are valid.
- Completion condition: approval-pending receipt or validation error is visible and recorded.
- Recovery condition: over-limit, missing-source, or permission-deny cases must be recorded as expected failures, not manually bypassed.

### HOUSING-LEASING-01 — Lease lifecycle preparation

- Role: Housing leasing specialist
- Start point: housing tenants or leases page
- Goal: prepare a lease using an eligible tenant and unit, then hand off to approval/signature according to role permission.
- Completion condition: lease reaches the intended pre-approval or pending state.
- Recovery condition: participant records eligibility blockers or permission-deny states.

### HOUSING-APPROVER-01 — Lease approval decision

- Role: Housing approver
- Start point: approval task or lease detail
- Goal: review a lease approval request and make an allowed decision without modifying maker data.
- Completion condition: decision state and audit trail are visible.
- Recovery condition: stale version, ineligible lease, or same-actor maker-checker block is recorded.

### HOUSING-HANDOVER-01 — Move-in or move-out handover

- Role: Housing handover staff
- Start point: assigned handover task
- Goal: complete a handover with keys, meter readings, item counts, notes, and photo evidence as applicable.
- Completion condition: handover record is visible and linked to the lease.
- Recovery condition: financial move-out amounts must follow approval flow; direct bypass is a failure.

### HOUSING-BILLING-01 — Bill generation and receivable review

- Role: Housing billing staff
- Start point: housing billing page
- Goal: generate or review bills for an eligible lease and verify duplicate prevention behavior.
- Completion condition: receivable state and any duplicate warning are recorded.
- Recovery condition: participant records conflict or permission-deny messages.

### CASHIER-01 — Payment registration

- Role: Cashier
- Start point: housing finance or billing detail
- Goal: register an allowed payment against an eligible receivable without exceeding remaining amount.
- Completion condition: ledger state and receivable balance are visible.
- Recovery condition: overpayment and voided receivable attempts must be recorded as expected blocks.

### FINANCE-APPROVER-01 — Refund, waiver, or deposit return approval

- Role: Finance approver
- Start point: approval task or housing finance detail
- Goal: review and decide a refund, waiver, or deposit-return request with maker-checker separation.
- Completion condition: decision result and linked ledger/effect audit are visible.
- Recovery condition: stale source, missing recorder, or same-actor blocks are recorded.

### PURCHASE-REQUESTER-01 — Purchase request and evidence

- Role: Purchase requester
- Start point: housing purchases page
- Goal: create or review a purchase request and attach required receipt/evidence in UAT scope.
- Completion condition: purchase is visible with expected evidence state.
- Recovery condition: file removal and protected-bound-file behavior are recorded if encountered.

### PURCHASE-APPROVER-01 — Purchase approval or rejection

- Role: Purchase approver
- Start point: approval task or purchase detail
- Goal: decide a purchase lifecycle action only when permission and state allow it.
- Completion condition: lifecycle state and audit trail are visible.
- Recovery condition: transferred, refunded, voided, or stale purchases must block as expected.

### PAYMENT-STAFF-01 — Purchase payment or transfer-to-charge

- Role: Payment staff
- Start point: purchase detail
- Goal: pay an approved purchase or transfer eligible purchase items to tenant charge according to permission.
- Completion condition: payment or transfer result is visible with linked financial effect.
- Recovery condition: already-transferred, refunded, or cross-unit cases must block.

### REPAIR-STAFF-01 — Repair processing with attachment

- Role: Repair staff
- Start point: assigned housing repair task
- Goal: open assigned repair, record handling progress, and verify attachment preview/download behavior.
- Completion condition: repair status/evidence state is visible.
- Recovery condition: no-manage, cross-park, or protected-file delete attempts must be recorded as expected blocks.

### AUDITOR-01 — Trace audit and permission boundary

- Role: Auditor
- Start point: dashboard, task list, approval list, or detail route provided by coordinator
- Goal: trace one business action from source record to approval/effect/audit evidence while confirming write actions are unavailable.
- Completion condition: participant records visible audit evidence and denied write paths.
- Recovery condition: any overbroad write access is P0/P1 and must stop the affected cohort.
