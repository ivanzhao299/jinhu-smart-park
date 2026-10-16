# Source material to ordinary performance operations

## 1. Scope and reachability

Use `PerformanceSourceActivation` inside a saved `PerformanceSourceDraftsPanel` target, keyed by saved revision and the existing user-context workspace. Opening previews/history is lazy and selected-kind scoped. Only the corresponding source manager plus template manager sees activation controls; readers retain preview/history. Unsaved material changes disable activation and source-derived configuration replacement. Saving source material never automatically activates it.

## 2. Shared and API contract

Consume the strict shared source-activation request/preview/receipt types. Four adapter methods preserve encoded draft IDs, revision/hash CAS, original idempotency keys, tokens and AbortSignals: activation-preview, activate-template, activate-review and activations. Template-only activation creates an editable draft. Review mode is explicitly chosen between qualified source initial values and empty current-business creation; never silently fall back when qualification is unavailable. Employees, organizations and dates come from the saved material binding, not a second conflicting browser payload.

`/templates/:id` accepts a **template parent ID**, never a version ID. Current target selection reads this route and verifies the expected current version, definition and workflow heads before freezing the request. The template list projection does not carry versions: keep all candidate parents, lazily load the selected parent detail to discover its complete versions, including older five-channel versions when the current version is dimension-based. For a chosen policy-reference version, confirm parent membership then read its existing definition/workflow histories by version ID. Require both current heads to exist and the workflow to reference exactly that definition revision. Validate both shared shapes; mismatched or missing heads cannot be copied. Never infer version-detail support from a mocked transport.

## 3. Configuration and complete carriers

Source-derived configuration is explicitly copied into the existing unsaved draft editor and requires ordinary save/revision CAS. Reuse the full definition/workflow editors, including all paged projects, guides, grades and independent details. Policy copying keeps source weights, source adjustment switches, catalogs and detail identities, and copies only the selected business policies. A reference without optional detail appraisal must not erase the source's existing paired detail appraisal policy. Clone copied objects to prevent alias mutations.

Show field-specific Chinese readiness explanations. Match a detail identifier to its configured display position only for presentation; identity never comes from array position. Difference views retain exact strings and whitespace, distinguish null/empty/zero, and page the complete collection. Source and ordinary narrative editors preserve multiline text and enforce200/500 Unicode codepoints, including astral characters; HTML maxlength must not prematurely reject a valid string. Salary differences are absent when salaryReferenceAvailable is false. Preserve pending human source edits as later normal-stage work, not as an alternate privileged baseline. Technical identifiers/hashes stay in folded evidence.

## 4. Mutation continuity and authority

Use the parent's synchronous writer lock for preview, configuration save and activation. Capture body/key/token once; double clicks cannot start another writer. A transport/processing/malformed receipt failure retains and freezes that exact attempt. A definite field/scope/CAS rejection preserves the form, releasing the attempt for explicit correction. No 409 auto-refresh may overwrite the draft. User/target disposal aborts owned requests, suppresses late completions and releases only the owned lock. Callback identity changes alone must not release a live lock.

The safety receipt has exactly the shared closed keys, UUID identities matching the submitted draft/revision, outcome created/alreadyActivated, and kind-correct null/non-null target IDs. After a known successful POST, retain the receipt independently of history GET success. Retry-read never resends POST. Existing historical activation links may refer to an earlier material revision; validate their own IDs without pretending they belong to the new head. Server live guards remain authoritative before idempotency replay.

## 5. Ordinary business continuation

Review receipt continuation uses the ordinary cycle-filtered review list. Reopening an already-selected cycle must explicitly refresh rather than leave the page loading with unchanged query dependencies. Template receipt continuation uses `PerformanceTemplates.requestedVersion` with parent ID, version ID and a request sequence. Reuse its normal validated open/edit path. A later template version is reported explicitly; historical versions remain available through ordinary history. Do not create a separate source-only scoring or approval page. Normal channel current/history may carry optional `sourceOrigin`; project only the closed UUID/mode/qualification-boolean summary, reject private extensions or contradictory manual qualification, and fold it as ordinary intake evidence. It does not add editable cells, stages or salary visibility.

## 6. Design and acceptance

Use shared ds-panel/ds-scene-grid/ds-button/form-field surfaces. Module CSS expresses only local layout: min-width:0 fieldsets, wrapping action rows and touch-sized labels/buttons. Do not introduce native grey button/icon styles. Histories must remain visible on desktop and phone. Final acceptance uses actual components in the native in-app browser on desktop and a 390px-class viewport, checks no horizontal overflow and stable touch targets, and preserves fixture/source hashes. Synthetic browser evidence is separate from actual PostgreSQL/API, production runtime and business acceptance.

## 7. Verification and remaining gates

Focused tests: source activation/component and API, existing source material/component and API, ordinary template workflow and review browsing. They verify full 101 independent details/41 grades/23 guides during policy copy, delayed/mismatched policy reads, exact parent/version routes and paired heads, abort/blocking, explicit manual mode, uncertain same-request retry, strict receipts, known-write read recovery, salary omission, unsaved configuration, readiness and history paging. Run producer shared build, affected lint and Web typecheck. Independent union review, final Web build/native browser, actual full-chain SQL/HTTP lifecycle, production runtime and real-role checks are separate required gates. July calculate-only business trial remains independent and NOT_EXECUTED until real evidence.

Configuration difference keys render as Chinese business labels. Activation name/code/reason controls provide twice the code-point bound as their UTF-16 input envelope; the shared closed-body validator enforces the actual 64/120/2000 code-point limits before a write. Keep the original text without trimming.
