# 实施计划

1. 数据库与种子
   - 将 `000190` 收敛为 schema-only。
   - 新增 Runner production-safe seed，修正 role conflict target 与后续 join。
   - 更新 seed/release 文档和 release-smoke 断言。
2. API
   - 补齐 controller permissions 和 renew endpoint/DTO。
   - 将 triage、renew、recordResult 改为锁内状态转换。
   - 实现最终验收标准和结构化 release evidence 校验。
   - 扩充 service/controller contract tests。
3. 工作流
   - 修复 activation SSH 初始化与双端敏感文件清理。
   - 实现 rollback snapshot 三态清理。
   - 自动判定数据库相关 PR 并运行 release-smoke。
4. Web
   - 抽出分页纯逻辑并补单测。
   - 接入服务端分页、loading/error/boundary 状态。
   - 用共享 DS 类重构生产表面，CSS module 仅保留定位与域布局。
5. 防复发
   - 添加 migration/seed/workflow source contract 测试。
   - 运行 `trellis-break-loop`，更新 operations、API、Web specs。
6. 验证
   - 目标 API/Web 单测；`pnpm test:unit`。
   - `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm css:check`。
   - YAML parse、seed SQL 静态契约、可用时在 disposable PostgreSQL 跑 release-smoke。
   - `git diff --check` 和变更范围核验。
7. 交付
   - Trellis check，提交并推送 `codex/fix-pr224-review-deploy`。
   - 创建中文 PR，正文映射 12 条 review 与验证结果，请求 Codex review；不自动合并。

## 风险文件与回滚点

- `database/migrations/000190_*`：只因生产状态为 failed 才允许修改，提交前再次核对 history 语义。
- `.github/workflows/deploy-production.yml`：删除路径必须绑定精确 rollback root，失败时不得吞掉原始返回码。
- `admin-issues.service.ts`：事务锁和状态矩阵必须由回归测试覆盖。
- `AdminIssueFeedback.tsx`：桌面与 390px 均需实际渲染检查；若环境无法启动，明确记录未验证项。
