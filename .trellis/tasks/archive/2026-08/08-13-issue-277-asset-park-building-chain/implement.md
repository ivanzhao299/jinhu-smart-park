# 实施计划

1. 加载 API/Web/Shared 规范，确认认证 token 更新 helper、Design System 与测试模式。
2. 编写/补充失败测试：当前园区默认、多园区选择、切换失败不创建、切换成功使用新 token、不可迁园、越权/无效园区。
3. 实现楼栋页园区候选、必选下拉、当前园区列表/详情展示和 token/context 安全切换；使用共享表单与 DS surface。
4. 补齐 API 响应/查询所需的最小园区展示契约，不接受任意目标 scope；复用既有授权逻辑。
5. 新增 `000211` 数据完整性迁移及 PostgreSQL 负向测试，同步实体索引。
6. 验证楼层、房源级联未回归；补充必要的逻辑/API 测试。
7. 运行 formatter/lint/typecheck/build、目标 unit/PG/API E2E、空库 migration、release smoke；实际浏览器检查桌面和 390px。
8. Trellis check 与 spec 更新，检查仅包含 Issue #277 文件；提交并推送。
9. 创建 draft PR，等待 CI；触发并读取最新 head Codex Review，逐条修复、回复、解决线程，重复直至 CI/review 全绿。
10. Ready 后启用 GitHub auto-merge；监控合并和 main deploy。确认 migration、seed、health/ready、公开 UAT、Docker cleanup；任何失败停止后续并按现有回滚流程处理。

## 验证命令

- `pnpm --filter @jinhu/api test`
- `pnpm test:unit`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- disposable PostgreSQL: `pnpm db:migrate` + migration/PG fixture
- `node scripts/e2e/first-release-users-assets.mjs`（具备隔离环境时）
- `pnpm check:s1` / release-smoke 等 CI 等价门禁

## 风险与回滚点

- token 轮换后不得继续使用旧 token；以共享认证写入逻辑为唯一实现。
- 迁移 preflight 发现历史漂移时不自动修复，停止并输出具体 scope/记录。
- 不允许编辑楼栋园区，避免产生下游冗余 scope 漂移。
- 生产部署必须设置 `PRUNE_DOCKER_AFTER_DEPLOY=yes`，清理失败必须显式报告。
