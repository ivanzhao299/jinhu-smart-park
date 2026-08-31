# Design: IDY Full-chain UAT

## Authority and phases

1. Phase 0 maps F01-F05 and G1-G7 requirements to current code, tests, API routes, and reports.
2. Preflight freezes one RUN_ID, loopback ports, Compose project, database, file root, Chrome profile, table list, manifest schema, and teardown targets.
3. Static/focused gates prove fail-fast crypto, key rotation, governance schemas, reveal audit, housing transaction ordering, menu/module/auth contracts, and E2E safety contracts.
4. One disposable runtime executes migrations, production-safe seed, bootstrap/baseline, explicit operation fixtures, real Homestay/Housing API E2E, and read-only evidence queries.
5. An isolated Chrome profile records login/workbench masked-default observations at desktop and phone width; screenshots and raw Network remain local-only.
6. Cleanup records per-table residual classification, logs out, parks Chrome at `about:blank`, validates PID/log ownership, destroys only the exact Compose project and file/profile roots, then proves zero resources/listeners.

## Evidence model

- Committed report: `docs/uat/identity-hard-defects-uat-<RUN_ID>.md`.
- Local-only root: `/tmp/jinhu-identity-uat-<RUN_ID>/` with `logs/`, `screenshots/`, `network/`, `db/`, `manifests/`, and SHA-256 manifest.
- No plaintext identity data, ciphertext, hash, secret, token, cookie, Authorization header, password, connection string, or signed URL is copied into the report.
- Immutable audit/effect rows are counted but not deleted; volume destruction is their final residual gate.

## Frozen G1-G7 mapping

- G1 permission-to-menu quadrants.
- G2 module legal/disabled/window combinations and dependencies.
- G3 metadata drift/orphan fail-closed.
- G4 legacy/canonical landing and auth routing.
- G5 authorization refresh and session convergence.
- G6 one target park/origin identity across Chrome/API/DB.
- G7 unchanged Property API/security/maker-checker/file/scope regression.
