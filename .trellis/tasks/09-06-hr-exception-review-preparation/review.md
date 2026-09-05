# Root integration review

## Scope and findings

Reviewed the preparation library, private CLI, shared materializer changes and the nonempty synthetic roundtrip test. No new production writer, activation change, database operation or signing identity is introduced. Prepare normalizes explicit quarantine fields before encryption; finalize verifies external signatures against the supplied pinned public keys and passes the existing freeze consumer. The execution-envelope hex encoding preserves the same nonce, tag and ciphertext represented in review base64.

The signature check does not establish organizational authority. The final execution contract remains independent. An explicit partial quarantine projection is not a full archival copy of the original legacy row. Existing source evidence must remain retained.

The shared IO extraction preserves the existing exclusive-output and receipt-last implementation. Its scratch read buffer is cleared in finally. Both modes validate the full candidates once, not twice. Full-scale READY-path memory consumption is not established by these synthetic tests.

## Independent checks

- `node --test scripts/e2e/yuzhou-production-import-candidate-freeze-contract.mjs scripts/e2e/yuzhou-production-import-freeze-materializer-contract.mjs scripts/e2e/execute-production-import.contract.mjs`: 65 passed, 0 failed, 1 optional 65 MiB sealed-plan test skipped; approximately 4.39 seconds.
- `node --test scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs`: initial 12 passed, 0 failed; approximately 252 ms. Includes private prepare, genuine synthetic external signature, private finalize, existing freeze/generator and the actual execution crypto provider with nonempty fields and unchanged envelope bytes.
- `git fetch --prune origin` succeeded; `git rev-list --left-right --count HEAD...origin/main` returned 0/0 before integration.

Final independent focused regression: `node --test scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs scripts/e2e/yuzhou-production-import-crypto-provider-contract.mjs` passed 25/25 (14 new preparation tests plus 11 crypto tests), 0 skipped, approximately 293 ms. This includes freshly re-signed corrupt envelopes/plaintext/context rejection and private key-buffer clearing on success and post-key failure. Operator documentation and the seven-section backend spec were read in full and agree with the implemented boundary.

The implementer ran the direct bridge and payload-generator contracts successfully, plus syntax and diff checks. `pnpm lint` and `pnpm typecheck` were each attempted once; both are unavailable because this worktree has no node_modules (eslint/tsc ENOENT). Dependencies were not installed or borrowed from another worktree. CI must establish those project-wide checks; they are not locally passed.

All tests above use synthetic records and keys. No actual candidate regeneration, source extraction, full A/B run, production write or cleanup was performed. No blocking implementation finding remains in this bounded review. Production readiness, real external reviews and full-scale READY memory behavior remain unproven; the full migration goal stays active.
