# LEA-004 实施与续跑记录

## Ordered checklist

- [x] 创建 Issue #488 与分支 `codex/fix-lea-004-rental-status-sync`。
- [x] 调查住房、民宿权威转换、`rental_status`、occupancy 与审计模式。
- [x] 固化冲突优先级、事务与双写审计设计。
- [x] 实现共享 projection primitive 与单元测试。
- [x] 接入住房 activate/terminated 与民宿 check-in/check-out，补业务审计快照。
- [x] 增加原子/冲突回归与 targeted contracts；本机 PostgreSQL 条件测试无 `DATABASE_URL` 跳过，交 CI/后续 UAT DB 前后对比。
- [x] lint/typecheck/build、Trellis check、提交并创建 Closes #488 PR #490。
- [ ] review ≤3、PR CI/Smoke、merge、main CI/Deploy 双绿、归档。

## Resume point

- 2026-08-29：Issue #488 创建；最新 main `33679b0b` 上切分支；LEA-003 archive+journal 两个 Trellis 提交随本分支携带。
- 2026-08-29：住房 activate 位于 `HousingLeaseCommandService` 事务、terminated 位于 approval executor manager；民宿入住/退房均在 `HomestayStayCommandService` 事务；共享 occupancy 是跨业务权威，`UnitStatusLogEntity` 已支持 `system`。
- 2026-08-29：实现 `RentalStatusProjectionService`：共享 advisory lock + unit 行锁，10/30/40 与强状态优先级，跨 occupancy/live housing/homestay/commercial blocker，真实变化同事务写 system status log；四个权威写点接入。
- 2026-08-29：独立审查 5 点：advisory lock 与 40→10 已修；turnover operations 不作为出租 blocker（退房必须按验收落 10，availability 仍由 turnover 阻断）；workflow 终态提前返回保证 source replay 不重复；测试补四触点与锁断言。
- 2026-08-29：targeted 53 tests（51 PASS/2 DB conditional SKIP）后增量 10/10 PASS；workspace lint/typecheck/build（190 pages）PASS；API full unit 1652 tests：1611 PASS、0 FAIL、41 DB conditional SKIP；`git diff --check` PASS。
- 2026-08-29：PR #490 首轮 Codex review 提出 3 个有效 P2：40+剩余业务须归一 30、商业 blocker 须限实际生效合同、住房 effect audit 须保存 projection disposition。均已修复；新增 forward-only `000285_housing_rental_status_projection_audit.sql`，定向 22 tests 为 21 PASS/1 DB conditional SKIP，workspace lint/typecheck PASS。
- 续跑点：提交并 push 首轮修复，触发第 2（最终允许）轮 Codex review；等待 PR CI+Release Smoke，合并后等待 main CI/Deploy 双绿并归档。
