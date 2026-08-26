# Execution Plan

1. 从最新 `origin/main` 建 `codex/fix-housing-g01-uat-runtime-entry`，核验 #413 main CI/Deploy。
2. 阅读既有 UAT safety、docker compose psql、runtime control 与审计表模式，冻结命令参数和 SQL CAS。
3. 新增命令、根 package script、契约测试和 UAT 文档；不修改 production deploy/seed/migration。
4. 运行契约测试、相关静态契约、lint/typecheck/build 与 `git diff --check`；执行 Trellis check。
5. 在 Issue #405 评论最小方案与安全边界，commit/push/PR `Closes #405`，Codex review ≤3，修复有效 finding 后等待 PR CI。
6. merge 后周期性核验 main CI 与 Deploy Production 双绿；等待期间准备复测环境与矩阵。
7. 从全修复 main 重建隔离 UAT，使用新命令启用 approval runtime，完成 C03-D/C04-C10、DB/截图/manifest/residual/清理。
8. 提交复测报告 PR，review/CI/merge/main 双绿后归档 #405 子任务和住房 UAT 父任务。
