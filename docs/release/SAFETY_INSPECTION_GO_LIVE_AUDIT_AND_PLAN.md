# 巡检模块上线审计与改造方案

日期：2026-06-25

范围：金湖智慧园区安全巡检模块，包括巡检点、巡检模板、巡检计划、巡检任务、我的巡检、现场工作台、隐患联动和计划生成运行时。

结论：当前巡检模块已经具备基础数据模型、任务生成接口、任务执行接口和隐患联动能力，但仍偏“后台配置 + 说明性页面”。距离园区现场可上线使用，核心缺口集中在三处：现场执行流程不够顺手、提交/草稿保存机制不完整、巡检计划缺少自动 runtime 生成与逾期闭环。

## 1. 当前实现审计

### 1.1 后端能力

已具备：

- 巡检点：`SafetyInspectPointsModule`
- 巡检模板：`SafetyInspectTemplatesModule`
- 巡检计划：`SafetyInspectPlansModule`
- 巡检任务：`SafetyInspectTasksModule`
- 隐患联动：异常检查项可生成 `SafetyHazard`
- 权限控制：支持全局管理、处理人执行、数据范围过滤
- 烟测覆盖：`scripts/e2e/s5a-safety-smoke.mjs` 已覆盖点位、模板、计划、生成任务、开始、签到、提交、异常转隐患、严格 QR/GPS/照片校验

主要缺口：

- 没有巡检 runtime/scheduler 自动生成任务。
- `cron_expr` 已存储但未被真实解析，`custom` 频率会退化为每日逻辑。
- 任务提交支持 `finish_task=false`，但不是清晰的“草稿保存”语义，仍要求提交完整结果。
- 没有逾期扫描、提醒、升级、重新分派 runtime。
- 巡检计划删除时的未完成状态判断未覆盖当前完成状态 `30`，可能导致已完成任务仍阻止删除。

### 1.2 前端能力

已具备页面：

- `/safety/inspect-points` 巡检点
- `/safety/inspect-templates` 巡检模板
- `/safety/inspect-plans` 巡检计划
- `/safety/inspect-tasks` 巡检任务
- `/safety/my-inspect-tasks` 我的巡检
- `/operations/terminal` 现场工作台
- `/safety/hazards` 隐患闭环

已具备较好的现场执行基础：

- `OperationsTerminalClient` 可查看今日巡检任务。
- `InspectionExecutionDrawer` 支持开始任务、定位、签到、照片上传、检查项填写、异常转隐患。
- `OperationPhotoUploader` 已能处理现场照片上传，不需要用户手填 file_id。

主要缺口：

- `/safety/inspect-tasks` 和 `/safety/my-inspect-tasks` 的执行体验仍偏后台表格，存在手填 QR、手填照片 file_id 的路径。
- 我的巡检没有形成“今日任务 -> 到点 -> 签到 -> 逐项检查 -> 保存草稿 -> 提交 -> 异常隐患”的单线流程。
- 巡检计划选择点位和人员使用多选框，不适合真实园区大量点位。
- 检查项类型没有充分转化为专用输入控件，例如数字阈值、是/否、照片必填、异常说明必填。
- 异常生成隐患需要操作员主动勾选，实际业务更适合由模板策略默认生成。

### 1.3 上线状态矩阵

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| 巡检点维护 | PASS | 点位、位置、QR、GPS、照片要求已建模 |
| 巡检模板维护 | PASS | 模板和检查项已建模 |
| 巡检计划维护 | PARTIAL | 有频次和责任人，但点位选择与频次 runtime 不完整 |
| 手动生成任务 | PASS | 支持按计划生成且有幂等保护 |
| 自动生成任务 | FAIL | 缺少 scheduler/runtime |
| 我的巡检执行 | PARTIAL | 后端完整，前端体验需统一到现场工作台 |
| 照片上传 | PARTIAL | 现场工作台可用，后台任务页仍有 file_id 手填路径 |
| 草稿保存 | PARTIAL | 有非完成提交能力，但不符合现场草稿语义 |
| 异常转隐患 | PASS | 后端联动已具备，前端策略需强化 |
| 逾期闭环 | FAIL | 缺少逾期扫描、提醒和升级 |
| 主管看板 | PARTIAL | 缺少面向巡检执行率、逾期、异常的专项看板 |

## 2. 园区巡检业务目标流程

上线版本不应让用户理解内部模型，而应让四类角色能完成自己的工作。

### 2.1 安全主管/运营主管

目标：把巡检制度配置为可执行计划。

流程：

1. 维护巡检点：楼栋、楼层、区域、风险等级、二维码、GPS、照片要求。
2. 维护检查模板：消防、设备房、公共区域、装修现场、危化/高风险点。
3. 维护巡检计划：选择点位、频次、责任班组/责任人、开始时间、到期时间规则。
4. 启用计划并查看预计生成任务数量。
5. 在巡检看板查看今日应巡、已巡、未巡、逾期、异常、隐患转化情况。

### 2.2 巡检员/物业现场人员

目标：用手机或平板完成现场巡检，不理解系统字段。

流程：

1. 打开“现场工作台”或“我的巡检”。
2. 查看今日任务，按待办、进行中、逾期、已完成分组。
3. 进入任务后点击“开始巡检”。
4. 到点后扫码或确认点位，系统自动获取 GPS。
5. 上传签到照片。
6. 按检查项逐项填写：正常/异常、数字、文字、照片。
7. 发现异常时填写异常说明和照片，系统默认生成隐患。
8. 可保存草稿，离开后继续。
9. 完成全部必填项后提交。

### 2.3 整改负责人

目标：接收巡检异常产生的隐患并完成整改。

流程：

1. 收到隐患任务。
2. 查看来源巡检任务、点位、检查项、照片和描述。
3. 提交整改说明、整改照片。
4. 由安全主管复核闭环。

### 2.4 管理层

目标：看整体风险和执行质量。

指标：

- 今日巡检完成率
- 逾期任务数
- 异常率
- 隐患转化率
- 高风险点未巡数量
- 连续异常点位排行
- 班组/责任人完成率

## 3. P0 上线阻断项

P0 是巡检模块能否在园区真实上线的最低门槛。

### 3.1 自动任务生成 runtime 缺失

现状：

- 巡检计划已有 `frequency_type`、`start_date`、`end_date`、`next_generate_time`。
- 任务可通过接口手动生成。
- 没有后台 runtime 定时扫描计划并生成任务。

影响：

- 主管必须手动点生成，容易漏生成。
- 巡检计划“频次”对一线用户来说不是完整承诺。

建议：

- 新增 `SafetyInspectScheduler`，默认可配置开启。
- 定时扫描启用计划，判断 `next_generate_time <= now + lookahead`。
- 调用现有 `generateFromPlan` 生成任务。
- 保留现有唯一约束，避免重复生成。
- 记录 runtime 执行日志，便于审计和排错。

建议 runtime 配置：

```text
SAFETY_INSPECT_SCHEDULER_ENABLED=false
SAFETY_INSPECT_SCHEDULER_INTERVAL_MS=60000
SAFETY_INSPECT_GENERATE_LOOKAHEAD_DAYS=1
SAFETY_INSPECT_SCHEDULER_BATCH_SIZE=50
SAFETY_INSPECT_SCHEDULER_DRY_RUN=false
```

上线策略：

- 第一次上线建议先 `DRY_RUN=true` 跑一天，确认将生成的任务数量。
- 确认后开启真实生成。

### 3.2 现场执行流程不够闭环

现状：

- 现场工作台已有较好的执行抽屉。
- 巡检任务后台页仍存在手填 QR、手填照片 file_id 的操作路径。

影响：

- 真实现场人员难以使用。
- 用户会误以为照片上传、扫码、定位都没有完成。

建议：

- 将“我的巡检”统一改为现场执行体验。
- 复用 `InspectionExecutionDrawer` 和 `OperationPhotoUploader`。
- 后台任务管理页保留调度和查看，不作为一线执行主入口。
- 提供清晰状态流：待开始、进行中、已签到、草稿、已提交、异常已转隐患、逾期。

### 3.3 草稿保存语义不清

现状：

- `submitResults` 支持 `finish_task=false`，但仍要求完整必填项。
- 这更像“未完成提交”，不是现场草稿。

影响：

- 巡检员不能中途保存已填项。
- 网络中断、拍照未完成、临时离开时容易丢数据。

建议：

- 新增明确接口：`POST /safety/inspect-tasks/:id/draft`。
- 草稿允许保存部分检查项。
- 草稿不触发完成校验，不生成最终隐患。
- 本地前端同时保存 localStorage 临时草稿，提交成功后清除。
- 最终提交时再校验必填项、照片、异常说明和隐患生成策略。

### 3.4 自定义频次未真正支持

现状：

- `cron_expr` 存在。
- `computeNextGenerateTime` 未解析 cron。
- `custom` 会按默认每日逻辑推进。

影响：

- 主管选择自定义频次后，任务生成结果可能不符合预期。

建议：

- 上线 MVP 阶段先隐藏或禁用 `custom`。
- 或引入 cron parser，并在计划页显示“下一次生成时间预览”。
- 没有预览前，不建议开放自定义频次。

### 3.5 缺少逾期和升级机制

现状：

- 任务有 `due_time`。
- 没有 runtime 自动扫描逾期。

影响：

- 未巡任务不会主动暴露给主管。
- 无法形成日常安全管理闭环。

建议：

- 新增逾期扫描 runtime。
- 每 5 到 15 分钟扫描未完成且超过 `due_time` 的任务。
- 在看板中标红，并生成操作日志。
- 后续可接短信、企业微信或站内消息。

## 4. 改造方案

### Phase 0：上线前可用性补齐，预计 1 到 2 天

目标：不大改架构，先让巡检员能真实完成任务。

任务：

1. 将 `/safety/my-inspect-tasks` 的执行入口统一到现场工作台体验。
2. 将后台任务页的照片 file_id 输入替换为 `OperationPhotoUploader`，或明确后台页只做管理查看。
3. 检查项改为卡片式逐项填写，默认只暴露必要字段。
4. 增加“保存草稿”按钮。
5. 异常项默认勾选“生成隐患”，可由模板策略决定是否允许取消。
6. 修复计划删除时完成状态 `30` 未被视为已完成的问题。
7. 暂停或隐藏自定义 cron 频次，直到 runtime 支持。

验收：

- 巡检员可从“我的巡检”打开今日任务并完成一条巡检。
- 可以上传签到照片和检查项照片。
- 可以保存草稿并继续编辑。
- 异常项能生成隐患。
- 不需要手填照片 file_id。

### Phase 1：巡检 runtime，预计 3 到 5 天

目标：让巡检计划真正自动产生任务。

任务：

1. 新增 `SafetyInspectScheduler`。
2. 新增 runtime 配置项和启动日志。
3. 扫描启用计划并按 `next_generate_time` 生成任务。
4. 生成前输出 dry-run 统计：计划数、点位数、预计任务数、跳过原因。
5. 引入进程锁或数据库 advisory lock，避免多实例重复生成。
6. 生成后更新 `last_generate_time` 和 `next_generate_time`。
7. 新增逾期扫描逻辑。
8. 新增 runtime action log，供后台看板展示。

验收：

- 启用计划后，无需人工点击即可生成今日任务。
- 重复执行 scheduler 不产生重复任务。
- Runtime 日志能说明每次生成了什么、跳过了什么。
- 逾期任务能在看板和任务列表中明确显示。

### Phase 2：园区业务体验强化，预计 5 到 8 天

目标：提高主管配置效率和现场执行质量。

任务：

1. 计划编辑改为可搜索点位选择器：按楼栋、楼层、区域、风险等级筛选。
2. 支持批量选择点位和生成点位预览。
3. 支持班组/角色排班，先从角色解析人员，后续接真实排班。
4. 检查项按类型渲染：
   - 正常/异常：双按钮
   - 是/否：双按钮
   - 数字：带单位和阈值提示
   - 文本：说明输入
   - 照片：照片上传
5. 异常项要求异常说明和照片。
6. 支持任务改派、延期、取消、重开，并记录操作日志。
7. 巡检看板增加按楼栋、班组、责任人、风险等级的统计。

验收：

- 主管能在 5 分钟内创建一个覆盖多个楼栋的巡检计划。
- 巡检员每个任务只看到当前该填的内容。
- 异常项不会无说明、无照片提交。
- 主管能看到谁未巡、哪里异常、哪些逾期。

### Phase 3：移动化和生产增强，后续迭代

目标：提升大规模园区使用体验。

任务：

1. 浏览器扫码或移动端扫码能力。
2. PWA 离线草稿。
3. 巡检路线优化。
4. 企业微信/短信提醒。
5. IoT/视频事件自动触发临时巡检。
6. 点位二维码打印和贴码管理。
7. 巡检报告导出。

## 5. 建议任务状态机

建议统一任务状态：

| 状态 | 含义 | 入口动作 | 出口动作 |
| --- | --- | --- | --- |
| pending | 待开始 | runtime 或手动生成 | start |
| in_progress | 进行中 | 开始任务 | check-in、save draft、submit |
| checked_in | 已签到 | 扫码/GPS/照片签到 | save draft、submit |
| draft | 草稿 | 保存部分结果 | submit、continue |
| completed | 已完成 | 完成提交 | reopen |
| overdue | 已逾期 | runtime 扫描 | submit、extend、reassign |
| cancelled | 已取消 | 管理员取消 | 无 |
| reopened | 已重开 | 主管重开 | submit |

说明：

- 当前后端可以用现有 `pending/in_progress/completed` 先兼容。
- `checked_in/draft/overdue/reopened` 可以先在前端和看板上通过字段组合表达，后续再迁移为正式状态。

## 6. 提交与保存设计

### 6.1 草稿保存

接口建议：

```text
POST /safety/inspect-tasks/:id/draft
```

请求内容：

```json
{
  "check_in": {
    "qr_code": "P-001",
    "gps_lng": 118.123,
    "gps_lat": 31.123,
    "photo_file_ids": ["file_1"]
  },
  "results": [
    {
      "item_id": 1001,
      "result": "normal",
      "value_text": "",
      "value_number": null,
      "photo_file_ids": []
    }
  ]
}
```

规则：

- 草稿可以缺少必填项。
- 草稿不创建最终隐患。
- 草稿不把任务置为 completed。
- 草稿保存 action log。
- 前端 localStorage 保存未提交草稿，服务端草稿保存成功后同步状态。

### 6.2 最终提交

继续使用：

```text
POST /safety/inspect-tasks/:id/results
```

最终提交规则：

- 必填检查项必须完成。
- 必填照片必须满足。
- 异常项必须填写异常说明。
- 异常项按模板策略自动生成隐患。
- 成功后任务进入 completed。

## 7. Runtime 设计

### 7.1 自动生成任务

建议执行逻辑：

1. runtime 启动时读取配置。
2. 如果 `SAFETY_INSPECT_SCHEDULER_ENABLED=false`，只输出禁用日志。
3. 每个 interval 获取需要生成的计划。
4. 对每个计划获取分布式锁。
5. 计算本次应生成的 `plan_time`。
6. 调用现有 `generateFromPlan`。
7. 保存 runtime log。
8. 释放锁。

幂等策略：

- 保留现有唯一键：租户、园区、计划、点位、计划时间。
- 同一计划时间重复生成只跳过，不报错。
- 多实例通过 advisory lock 或 runtime lock table 避免并发生成。

### 7.2 逾期扫描

建议执行逻辑：

1. 扫描 `due_time < now` 且未完成/取消的任务。
2. 标记或派生 `overdue` 展示状态。
3. 写入 action log。
4. 后续接消息提醒。

### 7.3 Runtime 观测

看板应展示：

- runtime 是否启用
- 最近一次扫描时间
- 最近一次生成任务数
- 最近一次跳过原因
- 最近一次异常
- 下次扫描时间

## 8. 数据与迁移建议

短期可以少改表，优先复用现有结构。

建议新增或调整：

1. 任务草稿字段或草稿表：
   - `draft_payload`
   - `draft_saved_at`
   - `draft_saved_by`
2. runtime 日志表：
   - `runtime_type`
   - `plan_id`
   - `started_at`
   - `finished_at`
   - `generated_count`
   - `skipped_count`
   - `error_message`
   - `dry_run`
3. 检查项增强字段：
   - `photo_required`
   - `min_photo_count`
   - `number_min`
   - `number_max`
   - `abnormal_requires_description`
   - `abnormal_requires_photo`
   - `auto_create_hazard`

## 9. 上线验收清单

上线前至少完成：

- 安全主管能创建点位、模板、计划。
- 计划启用后能自动生成今日巡检任务。
- 巡检员能在“我的巡检/现场工作台”看到自己的今日任务。
- 巡检员能开始、签到、定位、上传照片、逐项填写、保存草稿、最终提交。
- 异常检查项能自动生成隐患。
- 主管能看到完成率、逾期、异常、隐患。
- 重复 runtime 执行不会重复生成任务。
- 逾期任务能被扫描和展示。
- 所有关键动作有 action log。

建议验证命令：

```bash
pnpm typecheck
pnpm lint
pnpm --filter @jinhu/web build
node scripts/e2e/s5a-safety-smoke.mjs
node scripts/e2e/safety-module-access-smoke.mjs
```

## 10. 推荐实施顺序

第一步：先修现场闭环。

- 统一“我的巡检”到现场工作台体验。
- 去掉一线场景中的 file_id 手填。
- 增加草稿保存。
- 强化异常转隐患。

第二步：补 runtime。

- 自动生成巡检任务。
- 逾期扫描。
- runtime 日志。

第三步：强化主管配置和看板。

- 搜索式点位选择。
- 计划预览。
- 执行率/逾期/异常看板。

第四步：移动化增强。

- 扫码、离线、消息提醒、二维码打印。

## 11. 最终判断

当前巡检模块不是从零开始，后端主链路已经比较完整，现场工作台也已有可复用基础。真正阻碍上线的是：流程没有被收束到一线人员能理解的一条路、保存和 runtime 没有明确产品化、频次计划没有自动执行。

建议不要继续增加说明性页面。下一轮应直接进入“巡检上线 P0 修复”：

1. 我的巡检现场化。
2. 草稿保存。
3. 自动生成 runtime。
4. 逾期扫描。
5. 异常自动转隐患策略。

完成以上 5 项后，巡检模块可以进入园区内部试运行。
