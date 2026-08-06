# B2c/B3 Domain Integration Execution Handoff v1

## Status

`D5 REMEDIATION IN PROGRESS / NO FINAL HANDOFF`

DEC-01～DEC-06 A 与线下签署授权已执行。2026-08-03 D5 独立审计发现此前“仅剩浏览器”
结论不完整，因此本文件不再表示 code gate 已通过。当前正在整改住房并发、前向迁移、
DEC-02 聚合余额与 Web/授权证据；完成后还需重跑完整 PostgreSQL、flag、build/startup
及浏览器/无障碍质量门，才能输出最终 domain handoff SHA。

## Implemented contracts

- Homestay cancellation freezes submission-time DB timestamp and the complete occupancy,
  credential, and confirmed-ledger contributor set; execution re-locks/revalidates the
  snapshot and commits all effects atomically.
- Legacy refund/waiver allocation is the locked direct-plus-mapped union; unresolved
  rows quarantine the source and block new approval.
- Housing checkout freezes the pre-created draft handover, target receivable mode and
  amount, Shanghai business date, evidence hashes, and ledger/deposit contributors.
- Purchase transfer freezes one aggregate receivable target plus per-item version CAS
  and audit; a new target is inserted only during approved execution.
- Paid/refunded purchases cannot be voided; refund retains approved/refunded.
- Runtime authority uses actual database unique names and checkout effect cardinality
  2/3 according to occupancy presence.

## Verification evidence

- API lint/typecheck/build: PASS.
- API domain/runtime/property wide specs: PASS.
- Nest application context: `APP_BOOT_OK`.
- Shared build/tests: 24/24 PASS.
- Web lint/typecheck/build: PASS; 158 routes generated.
- Decision validator: 16/16 PASS; actual record/directory validation PASS.
- PostgreSQL 16 DEC-01/02 integration: PASS on explicit temporary database; database
  dropped after the run.
- Temporary browser server started successfully, but browser-client rejected the
  workspace with `sandboxCwd is not a local file URI` before browser selection.

## Known operational notes

- The default local development database was advanced through migration 000188 by a
  subagent; 000189 then failed its intended preflight. No forward migration was
  reverted.
- The worktree contains broad pre-existing/user changes. This handoff claims only the
  tested domain-integration scope and does not claim a commit/output SHA.

## Remaining gate

- P0: housing checkout lock order/snapshot freeze and exact canonical advisory keys.
- P0: forward-only owner constraints plus DEC-02 direct-and-mapped aggregate balance
  concurrency enforcement; complete 000191/000192/forward-fix migration evidence.
- P1: exact-role HTTP/Web E2E, full domain PostgreSQL concurrency/crash/replay matrix,
  check-in TOCTOU and feature-flag rollback/re-enable drill.
- P1: restore the Codex application browser connection and collect
  320/360/390/768/desktop, keyboard, screen-reader, 200%/400% reflow and forced-colors
  evidence. The current blocker remains `sandboxCwd is not a local file URI`.

Only after every item above and final lint/typecheck/build/startup/diff checks pass may
this candidate be promoted to `B-domain-integration` with `open_P0_P1=[]`.
