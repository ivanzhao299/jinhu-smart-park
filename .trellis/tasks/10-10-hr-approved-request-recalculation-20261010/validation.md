# 验证记录

日期：2026-10-10。工作树：`/Users/mac/.codex/worktrees/hr-training-operation-continuity-20261009`。分支：`codex/hr-approved-request-recalculation-20261010`。

## 已通过

- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- `PARTY_DATA_ENCRYPTION_KEY=test-only-party-key-12345678901234567890 pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-attendance-request.spec.ts src/modules/hr/hr-attendance-calculation.spec.ts src/modules/hr/hr-attendance-approved-recalculation.spec.ts`：19/19 通过。
- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-attendance-approved-recalculation.test.tsx test/interaction/hr-attendance-request-workflow.test.tsx`：21/21 通过。
- `TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}' pnpm --filter @jinhu/web exec node --test --require ts-node/register app/hr/attendance/approved-request-recalculation.contract.spec.ts app/hr/hr-route.contract.spec.ts`：30/30 通过。
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/web lint`
- `git diff --check`

聚焦证据涵盖：operate 权限和租户园区边界、必需读取审计失败、批准状态、无日期和 32 天上限、上海结束零点边界；顺序部分成功、失败日期同键继续且成功日期不重放、停止、版本/员工/日期漂移、StrictMode 和快速点击、卸载、刷新失败、身份范围在途切换。

## 未运行的检查

- 未单独启动 PostgreSQL fixture：本片段没有迁移、DDL 或新的日考勤写入算法，日重算仍调用既有已验证的 API。未对生产、共享、历史导入或工资数据执行写入。

## 父会话补充验收

- 父会话浏览器验收已通过：实际组件在桌面和 390px 的合成 32 日期计划中完成第二日失败、重新核对、继续办理与月度刷新；`clientWidth=scrollWidth=385`，按钮高度 44px。证据截图和 `browser-proof.json` 由父会话持有。该为合成浏览器验收，不是实际岗位或生产业务验收。
- 父会话完整 Web Vitest：100 文件、752 例通过。API 构建 `62156` 和 Web 构建 `31889` 均以 exit 0 完成；Web 构建仍有既有无关警告。父会话已关闭本地服务器 `44722`（terminal 143）及浏览器标签 66、67。

## 后续门槛

本子任务保持 `in_progress`。实现、聚焦检查、完整 Web、浏览器和构建已经通过；等待 PR919 发布取证后，同树整合最新主分支并独立发布本切片。候选 d7a1cffa5781b09e39fc31b69973e67f35a8908c、watcher36961 和 CI37998668358 属于独立 A 跟踪，不在本工作树执行发布操作。
