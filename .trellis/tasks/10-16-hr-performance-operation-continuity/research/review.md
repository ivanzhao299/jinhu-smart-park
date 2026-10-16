# Performance-operation continuity review

Reviewed against `prd.md`, `design.md`, `implement.md`, the web frontend/spec guidance, and the live performance-v2 controller/service contracts on 2026-10-16.

## Verdict

Pass after self-fix. The client keeps an in-memory immutable attempt containing the captured access token, generated idempotency key, fixed payload closure, expected receipt, and success text. Transport failures, 5xx responses, idempotency-processing/payload-mismatch/reservation 409s, and malformed/mismatched receipts stay uncertain and can only retry that attempt. Ordinary business 409s and explicit 400/401/403/404/422 responses release the attempt while preserving the form draft; a clear 401 must not repeatedly reuse an expired captured token.

## Receipt contract check

| Operation | Backend receipt verified | Client acceptance verified |
| --- | --- | --- |
| cycle create | `id`, `status: planning` | exact status |
| cycle publish | requested cycle `id`, `status: self_review` | exact id/status |
| self review | requested review `id`, `status: manager_review` | exact id/status |
| manager review | requested review `id`, `status: calibration` | exact id/status |
| calibration batch create | `id`, `status: active` | exact status |
| calibration entry | entry `id`, string `beforeScore` / `afterScore` | all three fields |
| calibration completion | requested batch `id`, `status: completed` | exact id/status |
| acknowledgement | requested review `id`, `status: confirmed` | exact id/status |
| appeal | appeal `id`, `status: submitted` | exact status |
| appeal resolution | requested appeal `id`, decision status | exact id/status |

## Self-fixes

- Moved the sole retry control for an open review editor into that form, immediately after its error/action area. The control remains global only for non-editor actions, so each state exposes one accessible retry action. This makes retry usable at the 390px form location and preserves the one-attempt lock.
- Expanded the actual component interaction suite with a table-driven case for all ten writes. Each case first returns an invalid receipt, asserts the operation stays uncertain, retries from the rendered page, and proves the complete adapter argument list (including body/token/idempotency key) is unchanged on retry. It covers cycle creation/publication, self/manager review, calibration batch/create-entry/complete, acknowledgement, appeal, and appeal resolution.
- Added an assertion that uncertain self-review retry is physically within its open form.
- Classified an explicit 401 as a definite rejection and covered it, so the user can retain and amend the local draft after an expired-session response instead of being trapped in a retry loop.

## Additional continuity checks

- Starting a write invalidates and aborts earlier reads; generation matching rejects late responses.
- The keyed workspace unmounts on auth/park-context replacement; old completion cannot update the new scope or trigger its reload.
- A verified success clears the attempt and shows success before the follow-up read. A failed follow-up read retains that success and does not issue another write.
- Pending state disables editors, quick actions, filtering, pagination, refresh, exports, and navigation controls; ordinary rejection re-enables the draft.

## Limits

- This review did not perform a production write, deployment, release integration, real-role UAT, payroll calculation, historical import, or legacy-equivalence certification.
- Desktop and 390px native browser inspection was performed by the coordinating session. This review consumed its reported no-overflow result and fixed the retry placement it identified; browser artifacts must be regenerated from the final source by that session.

## CI follow-up: 38867314560

The CI unit-test job had two related failures in `hr-performance-review-browsing.test.tsx`; the remaining 148 files / 1202 tests passed. Both expectations predated receipt continuity: the pending-write test resolved a bare object, which is now deliberately an unverified receipt and therefore must not trigger a refresh; the failed-write assertion omitted the new fourth idempotency-key adapter argument. The component implementation and service receipt contract require `{ id: "review-1", status: "manager_review", score: "80" }` for a successful self-review.

The test fixture now returns that verified receipt, the pending-write resolver uses it explicitly, and the adapter expectation includes the generated key. The test additionally proves that a success followed by a failed refresh has no retry button, preserving the no-repeat-write guarantee.

Validated after the correction:

- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-performance-operation-workflow.test.tsx test/interaction/hr-performance-review-browsing.test.tsx test/interaction/hr-performance-result-export.test.tsx test/interaction/hr-performance-reward-evidence-api.test.tsx test/interaction/hr-performance-template-workflow.test.tsx` — 5 files, 53 tests passed.
