# 巡检模块上线改造实施记录

日期：2026-06-25

依据：`docs/release/SAFETY_INSPECTION_GO_LIVE_AUDIT_AND_PLAN.md`

## 1. 实施摘要

本轮已将巡检模块从“后台配置 + 说明性执行”推进为可试运行的园区巡检闭环：

- 我的巡检入口统一为现场工作台体验。
- 巡检执行支持开始、定位、扫码能力探测、拍照、逐项检查、保存草稿、最终提交。
- 草稿接口允许部分结果保存，不触发最终完成校验，不提前创建隐患。
- 最终提交默认完成任务，异常项默认生成隐患，并要求异常说明。
- 巡检 Runtime 可自动扫描到期计划并生成任务。
- 巡检 Runtime 可扫描逾期任务并标记逾期。
- 安全看板增加逾期巡检指标。
- 巡检计划页隐藏未真正开放的自定义 Cron，改为受控频次。
- 巡检计划点位选择改为可搜索勾选列表。
- 现场工作台支持今日巡检 CSV 导出。
- S5A 巡检烟测增加 runtime status、runtime dry-run 和草稿保存覆盖。

## 2. Phase 完成情况

### Phase 0：现场执行闭环

状态：已完成核心功能。

落地项：

- `/safety/my-inspect-tasks` 进入 `OperationsTerminalClient`。
- `InspectionExecutionDrawer` 增加保存草稿、扫码按钮、数字检查项输入、标准说明展示。
- 结果填写支持 `value_number`、照片、异常说明。
- 异常项最终提交默认生成隐患。
- 逾期任务仍允许开始、打卡、保存草稿和提交。
- 计划删除逻辑补入完成状态 `30`，避免已完成巡检误判为未完成。

### Phase 1：巡检 Runtime

状态：已完成 MVP。

落地项：

- `SafetyInspectRuntimeService`
- `SafetyInspectScheduler`
- `SafetyInspectRuntimeController`
- `POST /api/v1/safety/inspect-runtime/run`
- `GET /api/v1/safety/inspect-runtime/status`

Runtime 能力：

- 扫描启用计划。
- 根据 `next_generate_time` 生成任务。
- 使用现有唯一键保证同计划、同点位、同计划时间幂等。
- 使用 PostgreSQL advisory lock 避免多实例并发重复生成。
- 扫描逾期任务并标记为状态 `40`。
- 写入 `biz_safety_action_log`，`biz_type=safety_inspect_runtime`。

Runtime 开关：

```text
SAFETY_INSPECT_SCHEDULER_ENABLED=false
SAFETY_INSPECT_SCHEDULER_INTERVAL_MS=60000
SAFETY_INSPECT_GENERATE_LOOKAHEAD_DAYS=1
SAFETY_INSPECT_SCHEDULER_BATCH_SIZE=50
SAFETY_INSPECT_SCHEDULER_DRY_RUN=true
```

说明：不设置 `SAFETY_INSPECT_SCHEDULER_ENABLED=false` 时，调度器默认启用。

### Phase 2：业务体验强化

状态：已完成上线 MVP 范围。

落地项：

- 巡检计划点位选择从原生多选改为搜索 + 勾选。
- 巡检计划页明确 Runtime 自动生成语义。
- 暂不开放自定义 Cron，避免现场制度和生成结果不一致。
- 计划页显示下次生成预览。
- 安全看板增加逾期巡检。
- 现场工作台增加逾期 KPI。

后续增强：

- 班组排班。
- 更细粒度的数值阈值。
- 检查项级别照片强制数量。
- 任务改派、延期、重开。

### Phase 3：移动化和试运行增强

状态：已完成轻量 MVP。

落地项：

- 浏览器 BarcodeDetector 能力探测式扫码。
- 浏览器不支持扫码时明确提示手工输入点位码，不阻断执行。
- localStorage 本地草稿兜底。
- 服务端草稿保存成功后清理本地草稿。
- 今日巡检 CSV 导出，便于试运行核对。

后续增强：

- PWA 离线队列。
- 真正移动端扫码组件。
- 点位二维码打印。
- 企业微信/短信提醒。

## 3. 生产注意事项

上线前建议：

1. 先执行数据库迁移。
2. 先用 `POST /safety/inspect-runtime/run` 且 `dry_run=true` 验证预计生成结果。
3. 确认计划、点位、责任人无误后启用 runtime。
4. 观察 `biz_safety_action_log` 中 `safety_inspect_runtime` 记录。
5. 若需要临时暂停，设置 `SAFETY_INSPECT_SCHEDULER_ENABLED=false` 并重启 API。

本轮未新增表结构，因此没有新的迁移文件。Runtime 使用现有任务表、计划表、结果表和 action log。

## 4. 验证记录

已通过：

```bash
pnpm typecheck
pnpm lint
pnpm --filter @jinhu/web build
```

本地巡检烟测：

```bash
node scripts/e2e/s5a-safety-smoke.mjs
```

结果：未完成。原因是本机 Docker daemon 未运行，本地 API 无法连接 Postgres，脚本在等待 API 启动时超时。该失败不是 TypeScript/Next.js 构建错误。

## 5. 当前可试运行流程

1. 主管维护巡检点、模板、计划。
2. 计划启用后 Runtime 自动生成巡检任务。
3. 巡检员进入“我的巡检”或“现场工作台”。
4. 点击今日巡检任务。
5. 开始巡检。
6. 定位、扫码或填写点位码、上传签到照片。
7. 逐项填写检查结果。
8. 中途可保存草稿。
9. 最终提交完成巡检。
10. 异常项自动生成隐患。
11. 主管在安全看板查看完成率、逾期巡检、隐患闭环。

## 6. 剩余建议

巡检模块已具备内部试运行条件。建议下一轮只做生产观察和移动端细节，不再继续扩散后台说明页。

优先级：

1. 生产 dry-run 后开启 Runtime。
2. 选 1 到 2 条真实巡检计划试运行。
3. 收集巡检员现场反馈。
4. 补二维码打印和移动端扫码体验。
5. 接入消息提醒。
