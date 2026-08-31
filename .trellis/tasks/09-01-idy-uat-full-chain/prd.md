# IDY UAT full-chain regression

## Goal

Issue #521: isolated end-to-end identity governance UAT, G1-G7 regression, evidence report and exact teardown

## Requirements

- Execute only against one disposable Compose/PostgreSQL/API/Web/file-storage environment derived from one unique RUN_ID; no production or shared environment access.
- Complete Phase 0 design-to-implementation audit before starting the disposable runtime.
- Verify key fail-fast and old/new keyring decryption, consent notice version and withdrawal, retention legacy classification/due execution, reveal authorization/reason/audit, housing move-in gate, and homestay maker-checker identity chain.
- Re-run the authoritative G1-G7 regression mapping, including the real Property API Homestay and Housing suites.
- Capture a sanitized screenshot manifest, Chrome runtime/viewport evidence, Network summary, frozen table/residual matrix, exact resource ownership, and teardown proof.
- Preserve immutable audit records until the isolated database volume is destroyed; never disable triggers, truncate, or use broad cleanup predicates.
- Keep screenshots, raw Network payloads, credentials, environment files, and logs local-only. Commit only a sanitized report.

## Acceptance Criteria

- [ ] Phase 0 audit has no blocking design/implementation gap.
- [ ] All identity governance cases and negative/positive boundary cases pass without exposing sensitive values.
- [ ] G1-G7 pass under the frozen authority mapping and Homestay uses only submission/claim/decision verification.
- [ ] Browser evidence proves the isolated origin, actual viewport, masked default Party UI/API behavior, clean console/Network, logout, and `about:blank` termination.
- [ ] Residual and teardown gates prove exact project containers, volumes, networks, ports, PIDs, file root, profile, and temporary environment are removed.
- [ ] Report PR closes #521, passes hosted review and CI, squash-merges, and main CI/Deploy pass.

## Notes

- Parent queue: #509. F02-F05 are already on main; UAT base commit is `034b7317`.
- Do not touch HR, the user's primary Chrome, or containers owned by PhenixCode/AiWeiBaby.
