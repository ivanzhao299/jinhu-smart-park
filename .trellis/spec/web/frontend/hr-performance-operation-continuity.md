# Performance operation continuity

## Scope / Trigger

The ten main `HrPerformanceClient` writes: cycle create/publish, self/manager review, calibration batch create/entry/complete, acknowledgement, appeal and appeal resolution. Template authoring remains in its own workflow.

## Signatures

The matching `hrApi` methods accept a final optional `idempotencyKey` argument after `token`. Omission generates a new action-specific key for backwards compatibility; the workspace passes its captured attempt key explicitly.

## Contracts

An attempt captures token, fixed payload closure, key, success text and receipt acceptance. Retain it in memory only. Before writing, invalidate/abort pending reads. While uncertain, disable competing workspace actions and offer one retry using exactly that attempt; place retry inside an open editor, otherwise in the workspace. Identity/context replacement unmounts the keyed workspace and suppresses old completion.

Require a nonempty receipt id. Expected statuses are planning (create cycle), self_review (publish), manager_review (self), calibration (manager), active (create calibration), completed (complete calibration), confirmed (acknowledge), submitted (appeal), and the chosen decision (resolve). Existing-target writes require the requested id. Calibration entries require id and beforeScore/afterScore strings.

## Validation & Error Matrix

| Result | Handling |
| --- | --- |
| Matched successful receipt | Clear attempt, show success, close editor, then reload |
| Reload fails after success | Retain success; reload only, never repeat the write |
| Transport/5xx/invalid receipt | Retain attempt and frozen draft; original-request retry |
| Explicit400/401/403/404/422 | Release attempt and retain editable draft |
| Ordinary409 business conflict | Release attempt and retain editable draft |
|409 idempotency processing/mismatch/reservation uncertainty | Retain attempt; original-request retry |

## Good / Base / Bad Cases

Good: a lost self-review response retries the same body/token/key. Base: a new independent action gets a new key. Bad: a failed refresh triggers another cycle creation, or a normal401 traps an expired captured token in an endless retry loop.

## Tests Required

Use the actual component workflow test. Table-driven cases cover all ten writes, rejecting a malformed receipt then verifying identical arguments on retry and accepting the real backend shape. Also cover draft retention, double-submit lock, ordinary409/401, successful write followed by failed reload, context replacement, score validation and retry placement inside the form. Inspect desktop and390px actual components; synthetic transport proves UI behavior only.

Run all affected performance interaction suites, including review browsing, result export, reward evidence and template workflows. Their successful-write mocks must return actual receipt shapes, and adapter assertions must include the supplied key. Run the complete Web interaction suite before release after these adapter/receipt changes; do not weaken unknown-receipt rejection to keep an obsolete bare-object mock passing.

## Wrong vs Correct

Wrong: invoke the write adapter again without its original key after any network error. Correct: keep the unresolved attempt and invoke its captured send closure with the captured token/key. Wrong: classify reload failure as failed submission. Correct: record matched write success before reloading.
