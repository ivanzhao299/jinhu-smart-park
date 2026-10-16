# Performance operation continuity implementation

## Scope completed

- Added stable optional idempotency-key parameters to the ten modern performance write adapters: cycle create/publish, self/manager review, calibration batch create/entry/complete, acknowledgement, appeal, and appeal resolution.
- `HrPerformanceClient` now freezes each immutable attempt's payload closure, access token, and generated key in memory. Transport/5xx/receipt uncertainty offers only an original-request retry; competing workspace actions, filters, paging, editors, and refresh are disabled.
- A verified success receipt closes the relevant editor, records success before the follow-up read, and keeps that success visible when refresh fails. A normal business 409 and explicit 400/403/404/422 release the attempt and retain drafts; idempotency-processing/payload-mismatch/reservation 409 responses stay retryable.
- Starting a write increments the read generation and aborts the prior read so a pre-write request cannot overwrite an active draft or apply a stale page. Auth-context replacement still unmounts the keyed workspace and ignores its old completion.

## Files changed

- `apps/web/app/hr/performance/HrPerformanceClient.tsx`
- `apps/web/lib/hr-api.ts`
- `apps/web/test/interaction/hr-performance-operation-workflow.test.tsx`

## Validation

1. `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-performance-operation-workflow.test.tsx` — 1 file, 17 tests passed.
2. `pnpm --filter @jinhu/web typecheck` — passed.
3. `pnpm --filter @jinhu/web lint` — passed.
4. `git diff --check` — passed.

The added actual-component cases prove frozen body/token/key retry and disabled competing self-review controls during an uncertain response, plus ordinary 409 release with an editable draft. Existing component cases cover receipt-followed refresh failure, synchronous double submit, identity replacement, score validation, and appeal decisions.

## Limits

- No production write, deployment, real-role UAT, payroll calculation, historical import, or legacy-equivalence claim was made.
- Desktop/390px browser acceptance remains owned by the coordinating session; the local component tests use synthetic transport only.
