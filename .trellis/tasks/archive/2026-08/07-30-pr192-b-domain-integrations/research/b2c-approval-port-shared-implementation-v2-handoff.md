# B-2c Approval Port Shared Implementation v2 Handoff

Date: 2026-08-02  
Status: RETURNED / SUPERSEDED BY RE-SIGNED CONTRACT (AUDIT HISTORY ONLY)  
Contract input SHA: `5cb700cc3265a75422e3204cea30598b84ca7919dfa9c0e6a65194bd3ed48597`

## Correction

The frozen v2 ABI remains unchanged. Its golden now checks the exact ordered key sets
for `CreatePendingPropertyApprovalCommand`, `PropertyApprovalRequestProjection` and
`CreatePendingPropertyApprovalResult`, in addition to exact tokens, descriptions,
version, method names and nullable fields.

```text
packages/shared/src/property-business/track-b-contracts.ts	e70ff68fed5feb4bd81cbcf7397acbbc3edc98fb47f507df96707a07fc058fbe
packages/shared/test/track-b-approval-port-contract.test.cjs	096426986cfd514f6cdfe5e4ee60a84a0f762d3f2e73f0a312f12d58e19b9a4a
```

Manifest byte grammar is UTF-8/LF-only/final-LF:

```text
b2c-approval-port-shared-v2
file	<path>	<raw-sha256>
```

Rows are in the exact order shown above. Corrected candidate
`B2c approval port shared implementation SHA`:

```text
cc33749211c46c4ebb8617b7357bcdd50a4ca452f2b4beaae1cf902918dcd1b2
```

## Validation

- `pnpm --filter @jinhu/shared build`: PASS.
- `pnpm --filter @jinhu/shared test`: PASS, 5/5 file entries.
- The returned v1 SHA remains recorded in its original handoff as audit history.

This candidate does not update the current-authority locator. Promotion is joined to
the corrected runtime, forward schema and independent PostgreSQL Gate.
