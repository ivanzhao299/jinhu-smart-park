# PR192 Human UAT Task Cards

These cards are templates for external real-user execution. They state goals and allowed start points, but do not provide step-by-step product answers. The coordinator may localize labels and business examples, but any change to task wording must create a new `task_card_version` and cohort.

## Common Metadata

- `task_card_version`: `<fill-before-release>`
- `environment_id`: `<fill-before-release>`
- `build_sha`: `<fill-before-release>`
- `threshold_version`: `<fill-before-release>`
- `allowed_devices`: `desktop`, `phone_390px_class`
- `forbidden_assistance`: prefilled UUIDs, super-admin borrowing, host clicking for participant, step-by-step navigation answers
- `record_required`: success/failure, duration, interaction count, error count, help count, permitted-help type, forbidden-assistance type, contaminated/valid marker, device, first/repeat marker, anonymized participant ID, evidence references, consent status
- `invalid_attempt_rule`: attempts with host clicking, step-by-step navigation answers, coordinator-provided UUIDs, super-admin/wildcard credentials, or any other forbidden assistance must remain in the append-only observation ledger with `attempt_valid_for_metrics=false` and must not count toward cohort sufficiency or threshold metrics. Each exclusion must record a permitted contamination reason and independently reviewable evidence; slow or failed attempts cannot be excluded merely by labeling them contaminated.
- `maker_checker_identity_rule`: purchase requester, purchase approver, payment staff, housing approver, finance approver, homestay finance maker, and any approver/decision role must be separated by stable human participant identity for the same business case. Role-owner exceptions are forbidden for conflicting maker-checker pairs.

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
| Shared property asset manager | 5 | 4 | Desktop plus phone detail review |
| Auditor | 5 | 4 | Desktop plus permission-deny task |

## Frozen Task Card Catalog

Every row in this catalog is a complete frozen task card. Every participant in a role must attempt the four task IDs assigned to that role. Repeating one task four times, improvising an unlisted task, or changing a task after threshold freeze creates an invalid cohort and requires a new `task_card_version`. Every start point below must be reached from a discoverable role entry in the product navigation, dashboard, queue, or list; coordinator-provided hidden deep links are not valid task starts.

The detailed examples after the table are coordinator notes only; they do not reduce the required four-card-per-role matrix. A readiness evaluator must derive coverage from the 68 task IDs below, not from the example section.

Expected-denial tasks score as successful only when `expected_outcome_met=true`: the participant reaches the denial from the frozen discoverable start point, the denial matches the role/scope/field/action boundary under test, no superuser or coordinator workaround is used, and the observation records the denial message plus route/action context. A denied task that blocks an allowed role action, hides unrelated required context, or requires a hidden deep link is a failed attempt, not a passed expected denial. The success-rate metric must use the frozen expected outcome, not the attempted business mutation result.

| Task ID | Role | Start point | Goal | Completion evidence |
| --- | --- | --- | --- | --- |
| PARK-ADMIN-01 | Park admin | Primary navigation after login | Verify role-scoped property-business entry and menu availability. | Visible modules and denied areas recorded. |
| PARK-ADMIN-02 | Park admin | User/role or module visibility page | Verify exact role bundle and absence of superuser/wildcard capability. | Bundle and scope evidence recorded. |
| PARK-ADMIN-03 | Park admin | Dashboard/task list | Assign or inspect a scoped property task without crossing tenant/park. | Scoped task visibility recorded. |
| PARK-ADMIN-04 | Park admin | Discoverable role page with an unauthorized action or route entry | Confirm cross-scope or unauthorized page is denied. | Deny message and route recorded. |
| HOMESTAY-FRONTDESK-01 | Homestay front desk | Homestay dashboard or bookings queue | Locate a due arrival and prepare check-in readiness. | Booking state and next action recorded. |
| HOMESTAY-FRONTDESK-02 | Homestay front desk | Booking detail | Handle missing identity/stay readiness without bypass. | Blocker and handoff target recorded. |
| HOMESTAY-FRONTDESK-03 | Homestay front desk | Stay detail | Complete an allowed check-in/check-out transition. | Resulting state and audit cue recorded. |
| HOMESTAY-FRONTDESK-04 | Homestay front desk | Phone-width booking/stay page | Complete the same queue lookup on 390px-class device. | Mobile usability and any overflow recorded. |
| HOMESTAY-CLEANER-01 | Homestay cleaner | Assigned turnover task | Start and complete turnover with required evidence. | Turnover state and evidence state recorded. |
| HOMESTAY-CLEANER-02 | Homestay cleaner | Turnover detail | Record supply/consumable or exception details. | Submitted detail or validation block recorded. |
| HOMESTAY-CLEANER-03 | Homestay cleaner | Upload control | Exercise upload retry/recovery path. | Success or expected failure recorded. |
| HOMESTAY-CLEANER-04 | Homestay cleaner | Phone-width task list | Locate assigned work and complete field update on phone. | Mobile completion and help count recorded. |
| HOMESTAY-INSPECTOR-01 | Homestay inspector | Homestay tasks queue or inspector dashboard entry filtered to turnover exceptions | Review exception and record follow-up decision. | Decision or blocker recorded. |
| HOMESTAY-INSPECTOR-02 | Homestay inspector | Turnover evidence panel | Inspect file preview/download permission. | File behavior recorded. |
| HOMESTAY-INSPECTOR-03 | Homestay inspector | Completed turnover detail | Verify final state and audit trail. | Audit/evidence visibility recorded. |
| HOMESTAY-INSPECTOR-04 | Homestay inspector | Discoverable unauthorized turnover entry from homestay tasks/list filtering or role navigation | Confirm inaccessible turnover is denied. | Deny route/message recorded. |
| HOMESTAY-FINANCE-01 | Homestay finance | Booking finance detail | Create valid refund or waiver approval request. | Pending approval or validation result recorded. |
| HOMESTAY-FINANCE-02 | Homestay finance | Booking finance detail | Attempt over-limit refund/waiver and confirm block. | Expected error recorded. |
| HOMESTAY-FINANCE-03 | Homestay finance | Approval or finance source view | Verify source ledger, recorder, and amount projection. | Source/effective available amount recorded. |
| HOMESTAY-FINANCE-04 | Homestay finance | Finance list/detail | Trace ledger effect to booking/audit evidence. | Trace references recorded. |
| HOUSING-LEASING-01 | Housing leasing specialist | Tenants or leases page | Prepare eligible tenant/unit lease lifecycle. | Lease state and eligibility recorded. |
| HOUSING-LEASING-02 | Housing leasing specialist | Lease create/edit form | Validate blocked ineligible tenant/unit case. | Blocker and message recorded. |
| HOUSING-LEASING-03 | Housing leasing specialist | Lease detail | Submit lease to approval/signature handoff. | Pending state recorded. |
| HOUSING-LEASING-04 | Housing leasing specialist | Phone-width lease detail | Review lease summary on 390px-class device. | Mobile usability recorded. |
| HOUSING-APPROVER-01 | Housing approver | Approval task or lease detail | Decide eligible lease approval request. | Decision and audit trail recorded. |
| HOUSING-APPROVER-02 | Housing approver | Approval task | Confirm same-actor maker-checker block. | Expected denial recorded. |
| HOUSING-APPROVER-03 | Housing approver | Stale lease approval | Confirm stale/version conflict handling. | Conflict message recorded. |
| HOUSING-APPROVER-04 | Housing approver | Lease audit/effect view | Trace approval result to source/effect evidence. | Trace references recorded. |
| HOUSING-HANDOVER-01 | Housing handover staff | Assigned handover task | Complete move-in or move-out handover fields. | Handover record linked to lease. |
| HOUSING-HANDOVER-02 | Housing handover staff | Handover file control | Attach or verify handover photo evidence. | Evidence state recorded. |
| HOUSING-HANDOVER-03 | Housing handover staff | Financial move-out case | Confirm financial amounts require approval flow. | Expected approval/block recorded. |
| HOUSING-HANDOVER-04 | Housing handover staff | Phone-width handover form | Complete field workflow on phone. | Mobile completion recorded. |
| HOUSING-BILLING-01 | Housing billing staff | Housing billing page | Generate or review bills for eligible lease. | Receivable state recorded. |
| HOUSING-BILLING-02 | Housing billing staff | Billing action | Confirm duplicate bill generation is blocked. | Conflict/duplicate message recorded. |
| HOUSING-BILLING-03 | Housing billing staff | Charge plan editor | Save allowed charge plan change. | Plan version/state recorded. |
| HOUSING-BILLING-04 | Housing billing staff | Receivable detail | Trace receivable to lease and billing source. | Trace evidence recorded. |
| CASHIER-01 | Cashier | Housing finance/billing detail | Register allowed payment against receivable. | Ledger and balance recorded. |
| CASHIER-02 | Cashier | Payment form | Attempt overpayment and confirm block. | Expected validation recorded. |
| CASHIER-03 | Cashier | Voided/invalid receivable | Confirm payment cannot target invalid source. | Expected denial recorded. |
| CASHIER-04 | Cashier | Finance detail | Trace payment to recorder and receivable balance. | Trace evidence recorded. |
| FINANCE-APPROVER-01 | Finance approver | Approval task or finance detail | Decide refund/waiver/deposit-return request. | Decision and linked ledger recorded. |
| FINANCE-APPROVER-02 | Finance approver | Approval task | Confirm same-actor or missing-recorder block. | Expected denial recorded. |
| FINANCE-APPROVER-03 | Finance approver | Stale source case | Confirm stale source conflict handling. | Conflict recorded. |
| FINANCE-APPROVER-04 | Finance approver | Finance audit view | Trace approval execution to ledger/effect audit. | Trace references recorded. |
| PURCHASE-REQUESTER-01 | Purchase requester | Housing purchases page | Create or review purchase request with evidence. | Purchase/evidence state recorded. |
| PURCHASE-REQUESTER-02 | Purchase requester | Receipt upload | Upload and remove pending receipt in UAT scope. | Pending file behavior recorded. |
| PURCHASE-REQUESTER-03 | Purchase requester | Purchase detail | Confirm protected bound receipt cannot be deleted. | Expected block recorded. |
| PURCHASE-REQUESTER-04 | Purchase requester | Phone or desktop list | Locate request and verify status handoff. | Status and usability recorded. |
| PURCHASE-APPROVER-01 | Purchase approver | Approval task or purchase detail | Decide purchase approval/rejection. | Lifecycle and audit recorded. |
| PURCHASE-APPROVER-02 | Purchase approver | Transferred/refunded purchase | Confirm invalid lifecycle action blocks. | Expected block recorded. |
| PURCHASE-APPROVER-03 | Purchase approver | Stale purchase case | Confirm stale/version conflict handling. | Conflict recorded. |
| PURCHASE-APPROVER-04 | Purchase approver | Purchase audit view | Trace lifecycle decision to source/effect. | Trace references recorded. |
| PAYMENT-STAFF-01 | Payment staff | Purchase detail | Pay approved purchase. | Payment effect recorded. |
| PAYMENT-STAFF-02 | Payment staff | Purchase transfer action | Transfer eligible purchase items to tenant charge. | Transfer/charge effect recorded. |
| PAYMENT-STAFF-03 | Payment staff | Already-transferred/refunded item | Confirm duplicate or invalid transfer blocks. | Expected block recorded. |
| PAYMENT-STAFF-04 | Payment staff | Finance trace view | Trace purchase payment/transfer to ledger. | Trace evidence recorded. |
| REPAIR-STAFF-01 | Repair staff | Assigned repair task | Process repair with attachment review. | Repair state/evidence recorded. |
| REPAIR-STAFF-02 | Repair staff | Repair file control | Verify pending attachment retry/removal path. | File behavior recorded. |
| REPAIR-STAFF-03 | Repair staff | Bound repair evidence | Confirm protected bound file cannot be deleted. | Expected block recorded. |
| REPAIR-STAFF-04 | Repair staff | Phone-width repair page | Complete field update on phone. | Mobile completion recorded. |
| SHARED-PROPERTY-01 | Shared property asset manager | Shared property dashboard or asset/unit list | Verify property foundation entry, scoped assets, and allowed operating-mode context. | Visible scope and mode context recorded. |
| SHARED-PROPERTY-02 | Shared property asset manager | Unit or occupancy detail | Review occupancy/party relationship without exposing unauthorized sensitive fields. | Occupancy-party projection and masking recorded. |
| SHARED-PROPERTY-03 | Shared property asset manager | Operating-mode or foundation workflow entry | Attempt allowed mode/foundation handoff and confirm permission/audit behavior. | Resulting state or expected permission block recorded. |
| SHARED-PROPERTY-04 | Shared property asset manager | Cross-scope or unauthorized shared-property route on desktop and phone-width detail | Confirm cross-tenant/park and unauthorized shared-property access is denied. | Deny route/message and phone usability recorded. |
| AUDITOR-01 | Auditor | Discoverable audit or task entry from primary navigation | Trace one action to approval/effect/audit. | Audit evidence recorded. |
| AUDITOR-02 | Auditor | Direct write/action control | Confirm write actions are unavailable. | Denied write path recorded. |
| AUDITOR-03 | Auditor | File/evidence route | Verify sensitive field/file projection. | Masking/permission result recorded. |
| AUDITOR-04 | Auditor | Cross-scope route | Confirm cross-tenant/park data is denied. | Deny route/message recorded. |

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

### SHARED-PROPERTY-01 — Shared property foundation and scope review

- Role: Shared property asset manager
- Start point: shared property dashboard or asset/unit list
- Goal: verify the shared property foundation entry, inspect scoped assets or units, and confirm operating-mode context without crossing tenant/park scope.
- Completion condition: visible asset/unit scope, operating-mode context, and any expected denied area are recorded.
- Recovery condition: cross-scope, missing menu, unauthorized sensitive field, or phone usability issues are recorded with route and message.

### AUDITOR-01 — Trace audit and permission boundary

- Role: Auditor
- Start point: discoverable audit, dashboard, task, or approval entry reached from primary navigation; coordinator must not provide an undiscoverable deep link as the starting point
- Goal: trace one business action from source record to approval/effect/audit evidence while confirming write actions are unavailable.
- Completion condition: participant records visible audit evidence and denied write paths.
- Recovery condition: any overbroad write access is P0/P1 and must stop the affected cohort.
