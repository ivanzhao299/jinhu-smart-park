# LEA-004 实施与续跑记录

## Ordered checklist

- [x] 创建 Issue #488 与分支 `codex/fix-lea-004-rental-status-sync`。
- [x] 调查住房、民宿权威转换、`rental_status`、occupancy 与审计模式。
- [x] 固化冲突优先级、事务与双写审计设计。
- [x] 实现共享 projection primitive 与单元测试。
- [x] 接入住房 activate/terminated 与民宿 check-in/check-out，补业务审计快照。
- [x] 增加原子/冲突回归与 targeted contracts；本机 PostgreSQL 条件测试无 `DATABASE_URL` 跳过，交 CI/后续 UAT DB 前后对比。
- [x] lint/typecheck/build、Trellis check、提交并创建 Closes #488 PR #490。
- [x] review ≤3、PR CI/Smoke、merge、main CI/Deploy 双绿。
- [ ] Trellis 归档与 journal。

## Resume point

- 2026-08-29：Issue #488 创建；最新 main `33679b0b` 上切分支；LEA-003 archive+journal 两个 Trellis 提交随本分支携带。
- 2026-08-29：住房 activate 位于 `HousingLeaseCommandService` 事务、terminated 位于 approval executor manager；民宿入住/退房均在 `HomestayStayCommandService` 事务；共享 occupancy 是跨业务权威，`UnitStatusLogEntity` 已支持 `system`。
- 2026-08-29：实现 `RentalStatusProjectionService`：共享 advisory lock + unit 行锁，10/30/40 与强状态优先级，跨 occupancy/live housing/homestay/commercial blocker，真实变化同事务写 system status log；四个权威写点接入。
- 2026-08-29：独立审查 5 点：advisory lock 与 40→10 已修；turnover operations 不作为出租 blocker（退房必须按验收落 10，availability 仍由 turnover 阻断）；workflow 终态提前返回保证 source replay 不重复；测试补四触点与锁断言。
- 2026-08-29：targeted 53 tests（51 PASS/2 DB conditional SKIP）后增量 10/10 PASS；workspace lint/typecheck/build（190 pages）PASS；API full unit 1652 tests：1611 PASS、0 FAIL、41 DB conditional SKIP；`git diff --check` PASS。
- 2026-08-29：PR #490 首轮 Codex review 提出 3 个有效 P2：40+剩余业务须归一 30、商业 blocker 须限实际生效合同、住房 effect audit 须保存 projection disposition。均已修复；新增 forward-only `000285_housing_rental_status_projection_audit.sql`，定向 22 tests 为 21 PASS/1 DB conditional SKIP，workspace lint/typecheck PASS。
- 2026-08-29：第 2 轮 Codex review 提出 2 个有效问题：void audit 必须传 SQL NULL、confirmed cancellation/no-show 必须在 terminal 后重算以避免滞留 30。已修复并把处置结果写入各自 action audit；定向 46 tests 为 45 PASS/1 DB conditional SKIP，API typecheck/lint PASS。
- 2026-08-29：第 3（最终）轮 Codex review 提出 2 个边界：status-75 future-effective 合同已在 effective() 当下投影 30、且无日期调度器，故 release 按 75 权威保留；draft hold 取消也须重算。均已修复；不再触发第 4 轮。
- 2026-08-29：最终 PR CI `33247421951` build 绿但 Release Smoke 在住房 activate 真实失败：E2E 选中了 `rental_status=20` 锁定单元，新的强状态冲突按设计返回 409。修复测试基建，使住房链只选择并断言 10 可出租长租单元；不放宽业务冲突规则。
- 2026-08-29：重跑 `33248835488` build 绿，Smoke 暴露候选扫描先遇到无 operation eligibility 的 10 状态单元而 404；候选扫描现在仅跳过该预期 404，其他错误继续 fail-fast。
- 2026-08-29：再跑 `33250183645` build 绿，Smoke 明确断言无任何可用长租单元；根因是 disposable property fixture 只固化 usage/mode，未固化 rental status。夹具现将两套隔离单元同时初始化为 `rental_status=10`，保证新生命周期测试的前置契约。
- 2026-08-29：最终 PR CI `33251443377` 全绿（Release Smoke 22m5s、真实 Property API E2E PASS）；PR #490 squash merged 为 main `48204327`，Issue #488 CLOSED；该 SHA Deploy `33252944272` SUCCESS。随后 main 并发取消该 SHA CI，最新包含提交 `c806ce38` 的 CI `33253628779` 与 Deploy `33253628787` 均 SUCCESS。
- 续跑点：归档本任务并写 journal，然后进入全上线 UAT 报告任务。
- 续跑点：提交并 push 最终修复；等待 PR CI+Release Smoke，合并后等待 main CI/Deploy 双绿并归档。
