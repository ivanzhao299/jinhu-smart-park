# Implementation Plan

1. 定位 000194/000195/000200 的合同、history 与 audit 边界，确认所有已有回归执行顺序。
2. 保持 000200 immutable source 不变，用三重 SHA-256 replacement patch 加入阶段判定：pre-correction 保持 expand，post-000195 验证并保留 v3。
3. runner 只对 absent/failed history 执行 replacement；immutable-source 或 generated checksum 的成功记录只跳过，未知成功 checksum fail closed。
4. 扩展既有 000194 只读诊断和 workflow enforce，使 v1/v2/v3 与双 history 阶段一致，门禁位于任何生产变更之前。
5. 扩展 production-shaped PostgreSQL 回归到完整 migration tail + seed；加入 v3 成功、expand 直跑、definition drift、missing/extra、checksum 兼容拒绝案例。
6. 更新静态合同、部署/发布/测试文档及 Trellis project operations 规范。
7. 运行格式/语法、静态合同、disposable PostgreSQL 集成回放及相关 workspace 质量门。
8. 独立审查迁移 SQL、runner 兼容、CI/workflow 安全；修复发现项后提交、推送、创建中文 Draft PR。
9. 对最新 head 仅请求一次 `@codex review`，监控 CI 与所有 review threads；无新问题后自动 Ready/合并。
10. 监控合并后 Deploy；若出现下一个真实失败，保留回滚证据并创建下一闭环，直至生产部署与健康检查成功。

## Validation commands

- `git diff --check`
- `bash -n scripts/db-migrate.sh`
- `sh -n scripts/diagnose-000194-runtime-control.sh`
- `node --check scripts/e2e/migration-prerequisite-contract.mjs`
- `node --check scripts/e2e/verify-000194-runtime-control-retry.sh`（若转换为 Node；否则对应 shell 语法检查）
- `pnpm test:e2e:migration-prerequisites`
- production-shaped disposable PostgreSQL replay script
- GitHub Verify and Release Smoke

## Rollback points

- 本地实现未推送：恢复本任务变更文件。
- PR 未合并：补丁提交或关闭 PR，不触碰生产。
- 部署迁移失败：依赖 migration transaction + 既有 source snapshot rollback；不得手工改 history 或逆向执行成功迁移。
