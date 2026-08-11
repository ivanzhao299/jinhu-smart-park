# Implementation plan

1. Freeze evidence and contracts
   - Record run 31286011713 first failure and rollback evidence.
   - Freeze unchanged 000194 checksum and successful 001 prerequisite checksum.
2. Add ordered runtime-control convergence
   - Add `002_runtime_control_scope_reconcile.sql` under the 000194 prerequisite directory.
   - Keep it transactional, insert-only, deterministic, idempotent, and fail closed.
3. Add read-only diagnostics and predeploy gate
   - Add a runtime-control parity diagnostic using the same signed manifest and scope derivation.
   - Wire report/enforce workflow paths before any release side effect.
4. Add regression coverage
   - Extend prerequisite static contract.
   - Extend Release Smoke with production-shaped missing-row replay, failed-history retry, and
     extra/definition-drift failures.
   - Assert unchanged 000194 succeeds after convergence and records both history tables.
5. Synchronize operations docs/spec
   - Document diagnostic usage, classifications, retry boundary, and general pending-migration rule.
6. Validate and review
   - Run focused Node/static tests, shell/YAML checks, PostgreSQL Release Smoke where available,
     `git diff --check`, and independent Trellis review.
7. Publish closure
   - Commit/push branch, create Draft PR, request one Codex review per latest head, resolve verified
     feedback, and monitor CI/review/mergeability. Never deploy or merge automatically.
