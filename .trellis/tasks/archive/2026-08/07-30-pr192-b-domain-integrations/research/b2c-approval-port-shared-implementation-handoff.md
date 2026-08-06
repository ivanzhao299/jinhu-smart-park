# B-2c Approval Port Shared Implementation Handoff

Date: 2026-08-02  
Status: RETURNED / SUPERSEDED CANDIDATE (AUDIT HISTORY ONLY)  
Contract input SHA: `5cb700cc3265a75422e3204cea30598b84ca7919dfa9c0e6a65194bd3ed48597`

## Scope

The frozen ABI was added without aliases or additional methods:

- `PROPERTY_APPROVAL_PORT_CONTRACT_VERSION`
- `PROPERTY_APPROVAL_COMMAND_PORT`
- `PROPERTY_APPROVAL_PROJECTION_PORT`
- closed `PropertyApprovalJsonValue`
- exact command, result, projection and query declarations
- exact command/projection port method cardinality

Owned source files:

```text
packages/shared/src/property-business/track-b-contracts.ts	e70ff68fed5feb4bd81cbcf7397acbbc3edc98fb47f507df96707a07fc058fbe
packages/shared/test/track-b-approval-port-contract.test.cjs	53df2fbadd8c602999aee6fd2a49cdcc03e58546d8bcd9995d1e7c35e0609c9f
```

Manifest byte grammar is UTF-8/LF-only/final-LF:

```text
b2c-approval-port-shared-v1
file\t<path>\t<raw-sha256>
```

Rows are in the exact order shown above. Candidate
`B2c approval port shared implementation SHA`:

```text
b9856434c19c95588e5258b0e2e1e19e46898d5cb5b398c0621e9fa717d3e5a7
```

## Validation

- `pnpm --filter @jinhu/shared build`: PASS.
- `pnpm --filter @jinhu/shared test`: PASS, 5/5 test files.
- ABI golden verifies exact version, singleton symbol descriptions, methods,
  closed payload type and projection nullability.

## Release boundary

This v1 candidate was returned by independent Gate and remains only as immutable audit
history. A corrected candidate must publish a new manifest SHA and handoff.

This returned SHA does not update the current-authority locator and does not release
migrations, domain adapters, AppModule wiring or production enablement.
