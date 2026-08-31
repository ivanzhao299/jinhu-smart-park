# Implement: IDY-F04 Reveal Audit

## Status

- Branch: `codex/fix-idy-04-reveal-audit` from `origin/main@1e888d8e`.
- Issue: #513; parent: #509.
- F02/F03 predecessor: PR #512 merged as `1e888d8e`; Issue #511 closed; main CI #33384573249 and Deploy #33384573281 PASS; remote branch deleted and refs pruned.
- Implemented: ordinary Party detail no longer selects/decrypts plaintext; shared ordinary response removed `identityNumber`.
- Implemented: atomic `party:identity_reveal`, controlled reason codes, dedicated POST action, tenant/park scoped lookup, transaction-bound required audit, and separate Web reveal state.
- Implemented: forward-only `000288` per-tenant permission convergence plus production-safe default-scope reconciliation.
- Verified so far: shared build; API/Web typecheck; 39 focused API contract/service/controller tests PASS.
- Verified: Web contract PASS; PostgreSQL 16 preflight/fresh/replay/two-tenant checks PASS with exact temporary-database cleanup.
- Verified: API/Web lint and typecheck PASS; focused API contracts PASS; full API unit reached all suites with one corrected contract drift, then a Node 24 V8 crash in an unrelated idempotency test; that file and all affected contracts pass in isolated rerun.
- Independent review round 1: migration eligibility preflight strengthened; reveal intentionally remains outside response replay cache so every access receives a fresh required audit.
- Next: final diff/status, commit, push, PR, CI and hosted review.
