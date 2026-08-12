# 实施计划

1. 新增 000207 migration：不可变审计结构、确定性 survivor、锁、审计、软停用与后置断言。
2. 扩展 000189/000194 diagnostics，增加受 migration history 约束的临时可迁移分类，并保持所有漂移 fail closed。
3. 在 `prod-deploy.sh` migration 后、seed 前加入双诊断 enforce。
4. 扩展 migration prerequisite 静态合同并新增 `verify-000207-canonical-source-reconcile.sh` PostgreSQL fixture：生产 `CSYQ,JH` + 唯一 projection 成功收敛；无匹配阻断并回滚；成功 history 重跑幂等；迁移后双门禁 exact。
5. 更新 CI Release Smoke 触发/步骤和生产部署文档、Trellis backend contract。
6. 运行脚本语法、静态合同、目标 PostgreSQL fixture、lint/typecheck/build、完整 Release Smoke。
7. 独立复核无 P0-P2 后提交、推送、创建中文 PR，循环处理 Codex review 与 CI。
8. 合并后监控生产部署、健康、UAT 和 Docker cleanup，失败则继续安全修复直至成功。

## 风险与回滚点

- 数据写入风险集中于 000207；任何证据或更新数不符必须在 migration 事务内回滚。
- 预部署临时 ready 分类不能在 000207 succeeded 后生效，防止未来漂移被静默修复。
- workflow/prod-deploy 的 migration 后门禁失败时 API 保持停止，发布触发源码回滚但数据库保持 forward state。

## Validation Commands

- `sh -n scripts/diagnose-000189-asset-scope.sh scripts/diagnose-000194-runtime-control.sh scripts/prod-deploy.sh scripts/e2e/verify-000207-canonical-source-reconcile.sh`
- `node scripts/e2e/migration-prerequisite-contract.mjs`
- `sh scripts/e2e/verify-000207-canonical-source-reconcile.sh`
- `pnpm lint && pnpm typecheck && pnpm build`
- PR CI `Lint, Typecheck, Build` 与 `Release Smoke`

## 本地验证结果

- `sh -n`：通过。
- migration prerequisite 静态合同：通过。
- 隔离 PostgreSQL 000207 fixture：通过，覆盖成功收敛、迁移后 exact、history 重跑与无匹配事务回滚。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过；运行前通过同目录原子重命名临时隔离 root-owned 历史构建产物，完成后已恢复原目录。
- `git diff --check`：通过。
- 独立只读复核：未发现 P0-P2。
