# Lifecycle full template editor

## 1. Scope / Trigger

Creating lifecycle templates, managing current versions and creating employee checklists.

## 2. Signatures

LifecycleTemplateEditor owns controlled metadata and1..50 ordered DraftItems with stable local keys. LifecycleTemplateManager owns manage-only list/detail reads. HrLifecycleClient calls lifecycleTemplateOptions only for ASSIGN; its existing full authenticated-context and employee-navigation key resets every child.

## 3. Contracts

Add/delete/up/down controls preserve edited field ownership and refuse removal of the last item or creation beyond50. Serialize every item in current order, trim code/name/category, retain explicit requiredfalse and due0, reject duplicate codes/blanks/out-of-range integer offsets. Blank due omits defaultDueDays; displayed explanation uses the existing checklist dueDate semantics.

Create, version publish and checklist creation use explicit submit events. Failed writes retain all drafts and selections. Successful writes show explicit feedback and reset only the completed draft. Synchronous refs prevent rapid duplicate writers. Independent list failures report as refresh errors after committed success; never turn a successful publication into a failed draft.

Version form mounts only after the exact target detail succeeds, keyed by versionId. Replaced/closed detail requests abort and late responses are ignored. A save callback cannot reopen a closed or subsequently replaced target. Full identity/scope/authority context replacement unmounts drafts and aborts all owned reads.

`lifecycle-template-data.ts` validates and explicitly projects both summary consumers and editing detail. Require string identity/labels, known lifecycle type, positive version,1..50 itemCount, matching requested template ID and exact item cardinality, unique trimmed codes, boolean required and nullable integer due[-365,365]. Reject the whole malformed response before mounting options or the editor. Closing/reopening even the same template advances an edit generation; a committed publication's delayed refresh may not replace that newer draft. Optional refresh rejection retains the published success and reports a separate refresh error. Alive refs must rearm during StrictMode effect setup.

Use DS panels/cards/buttons/fields plus scoped layout-only CSS. Cards remain visible on desktop; touch actions min44px and local specificity exceed inherited full-width mobile button rules. No global colors, shadow or button-system rewrite.

## 4. Validation / Errors

Local errors render role=alert beside the owning form. Failed detail retains no previous target's editor; close/retry remain available. Candidate outage does not blank template management or existing checklists. OnlyASSIGN actors obtain minimal assignment summaries and cannot see template editor.

## 5. Good / Base / Bad

Good: reorder three edited tasks, remove one, publish the two remaining complete items in order.
Base: existing employee, departure-event, assignee, completion, return and evidence flows keep their original contracts.
Bad: serialize only the first task, use React form action that resets failed drafts, or restore another target after a late response.

## 6. Tests Required

Actual component tests for ordered payload fields,1/50 boundaries, duplicate/blank/due bounds, failed create/version/checklist drafts, synchronous repeated submits, manage detail load/close stale guard, assign-only candidate authority and full context reset. Retain existing employee-selection interaction suite. Parent serial acceptance inspects desktop/390px actual component; synthetic evidence does not replace production business-role acceptance.

Regress malformed summary/detail and mismatched target, retry recovery, same-template close/reopen during a pending post-publication refresh, and StrictMode success with optional refresh failure.

## 7. Wrong / Correct

Wrong: items:[firstTask] or action={caughtCreateError}.
Correct: controlled stable-key rows mapped in display order, explicit event.preventDefault, reset after confirmed response only.
