# Trellis check receipt

Reviewed 2026-10-19 against the task PRD/design/implementation notes and the API, shared, and Web payroll preparation contracts.

## Fixed during review

- `PayrollInputPreparation` now retains each existing settlement field whenever source values are applied. The prior truthiness check on `settlementStart` could discard other existing settlement metadata from a locally invalid/in-progress draft.
- The local source-preview owner fingerprint is held in a ref and is compared again after the live metadata-only preparation read, before the draft state is changed.
- The Web interaction suite now covers source preview/apply preserving a selected employee's settlement start, end, and reason.

## Verification

- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-payroll-input-preparation.test.tsx test/interaction/hr-payroll-input-continuation.test.tsx --maxWorkers=1 --minWorkers=1` — 20 passed.
- `pnpm --filter @jinhu/web lint` and `pnpm --filter @jinhu/web typecheck` — passed.
- `pnpm --filter @jinhu/api exec sh -c 'TS_NODE_TRANSPILE_ONLY=true PARTY_DATA_ENCRYPTION_KEY=test-only-party-key-12345678901234567890 node --test --test-timeout=120000 --test-concurrency=1 --test-reporter=spec --require ts-node/register src/modules/hr/hr-payroll-formal-input.spec.ts'` — 6 passed.
- `pnpm --filter @jinhu/shared build`, `pnpm --filter @jinhu/shared lint`, `pnpm --filter @jinhu/api lint`, and `pnpm --filter @jinhu/api typecheck` — passed.

The owned PostgreSQL source-value suite was not rerun after this Web-only fix; the frozen implementation receipt records it as passing and no API/shared source changed during review. Root's existing browser evidence covers the full 54-person source flow, phone layout, maximum/negative decimals, missing values, and pure-roster refresh preservation.

## Remaining boundary

Synthetic and browser evidence do not constitute real payroll amount equivalence or business authorization to confirm/pay. Those remain separate from this code task.
