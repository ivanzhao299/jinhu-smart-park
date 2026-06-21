# Agent Platform V2 Plan

本文档定义 Agent Platform V2 第一轮规划。目标是在不修改业务代码、不执行 Agent、不 push、不 deploy 的前提下，把当前 Agent Orchestrator 从约 78% 成熟度推进到 85%+ 的可持续自动化平台。

## 1. 背景

当前 Agent Orchestrator 已具备：

- 自然语言需求到 REQ / TECH / task queue 的文件化流程。
- READY task dispatch、claim、locks、runner prompt 生成。
- Codex CLI 串行执行、run log、失败停止。
- Agent dirty result 自动风险分级与分支提交。
- integration branch 自动合并 LOW / MEDIUM 成果、queue bookkeeping 冲突 reconcile、验证矩阵与 integration report。

当前主要瓶颈：

1. 多 Agent 仍可能同时修改 `task-queue.json`、`task-locks.json`、`task-results.json`，造成 queue bookkeeping 冲突。
2. Codex Runner 仍以串行为默认和主要安全路径，并发执行缺少 queue 写入隔离。
3. 验证矩阵仍依赖 JSON 聚合状态，未形成事件源与 read model 的清晰边界。

## 2. 本轮目标

V2 第一轮只做规划和任务拆解：

- V2-A：Event Sourcing Queue。
- V2-B：Parallel Agent Execution。
- 生成可由 agent-2 / agent-3 / agent-4 / agent-5 并行领取的任务。
- 保持现有 JSON 队列作为兼容层。
- 不写业务代码、不执行 Agent、不 merge、不 push、不 deploy。

## 3. 非目标

本轮不做：

- 不修改 `apps/api`。
- 不修改 `apps/web`。
- 不修改 `packages`。
- 不修改 `database/migrations` 或 `database/seeds`。
- 不修改 `infra`。
- 不修改 auth、CI、Docker、deploy。
- 不新增 migration。
- 不执行 Agent。
- 不执行 production migration / seed / cleanup / reset。

## 4. V2-A Event Sourcing Queue

### 4.1 目标

用 append-only 事件文件替代多个 Agent 对共享 JSON 文件的直接写入，降低 task queue、lock、result 的冲突概率，同时保留现有 JSON 文件作为兼容 read model。

### 4.1A 第一阶段实现状态

第一阶段已进入基础设施实现：

- 已定义 `ops/agent-orchestrator/events/`、`events/tasks/`、`events/results/`、`events/locks/`、`events/audits/` 目录边界。
- 已新增 `scripts/lib/event-store-utils.mjs`，提供 append-only task event、事件列表、queue/lock/result read model 汇总能力。
- 已新增 `bootstrap-event-store.mjs`，默认 dry-run，从现有 `queue/*.json` 规划 deterministic bootstrap events，`--apply` 才写事件文件。
- 已新增 `rebuild-queue-read-model.mjs`，默认 dry-run，从 events 汇总兼容 JSON diff summary，`--apply` 才写回 `task-queue.json`、`task-locks.json`、`task-results.json`。
- 已新增正式设计文档 `docs/release/agent-platform-v2-event-sourcing-queue-design.md`。
- 已新增测试计划 `docs/testing/agent-platform-v2-event-sourcing-test-plan.md`。

当前阶段仍保持现有 `claim-task.mjs`、`dispatch-ready-agents.mjs`、`complete-task.mjs`、`audit-all-results.mjs`、`integrate-agent-results.mjs` 写路径不变。后续阶段再逐步把 claim、complete、audit、integrate 切到 event-first 写入。

### 4.2 事件目录设计

```text
ops/agent-orchestrator/events/
├── tasks/
├── results/
├── locks/
└── audits/
```

建议文件粒度：

- `events/tasks/<task_id>/<timestamp>-<event_type>-<event_hash>.json`
- `events/locks/<task_id>.<agent>.lock.json`，后续阶段可作为 lock artifact 拆分目录。
- `events/results/<task_id>.<agent>.result.json`，后续阶段可作为 result artifact 拆分目录。
- `events/audits/<task_id>.audit.json`，后续阶段可作为 audit artifact 拆分目录。

每个 task / result / audit 独立文件，避免多个 Agent 写同一个 JSON。

### 4.3 事件基本字段

每个事件文件建议至少包含：

- `event_id`
- `event_type`
- `task_id`
- `agent`
- `status`
- `created_at`
- `source`
- `schema_version`
- `payload`

事件必须可重复读取、可排序、可校验。`event_id` 可由 `<timestamp>-<task_id>-<event_type>` 或 UUID 生成。

### 4.4 兼容层

现有文件继续保留：

- `ops/agent-orchestrator/queue/task-queue.json`
- `ops/agent-orchestrator/queue/task-locks.json`
- `ops/agent-orchestrator/queue/task-results.json`

V2 初期不删除这些文件，而是通过 read model 汇总事件后生成兼容 JSON，使现有脚本逐步迁移。

### 4.5 Read Model

Read model 负责从事件文件生成当前状态：

- READY / CLAIMED / IN_PROGRESS / DONE / FAILED / BLOCKED / AUDITED 任务状态。
- 每个 Agent 当前 active lock。
- 每个 task 的 latest result。
- 每个 task 的 latest audit。
- batch-level 状态汇总。

Read model 输出可以继续写回 `queue/*.json`，但写入动作应集中在 orchestrator，不由多个 Agent 并发写同一 JSON。

### 4.6 Migration / Adapter

迁移分阶段：

1. Phase A0：定义事件 schema 和目录。
2. Phase A1：从现有 `queue/*.json` 生成初始事件文件。
3. Phase A2：新增 read model 汇总脚本，生成兼容 JSON。
4. Phase A3：改造 `complete-task.mjs` 写 per-task result event。
5. Phase A4：改造 `claim-task.mjs` / `dispatch-ready-agents.mjs` 写 lock event。
6. Phase A5：改造 audit / reconcile / integration 使用 read model。
7. Phase A6：保留 JSON 输出作为兼容层，直到全部脚本切换完成。

### 4.7 需要改造的脚本

- `claim-task.mjs`
- `complete-task.mjs`
- `dispatch-ready-agents.mjs`
- `check-dispatch-status.mjs`
- `audit-agent-result.mjs`
- `audit-all-results.mjs`
- `reconcile-task-results.mjs`
- `commit-agent-results.mjs`
- `integrate-agent-results.mjs`
- `run-validation-matrix.mjs`
- `orchestratorctl.mjs`
- `lib/queue-utils.mjs`

## 5. V2-B Parallel Agent Execution

### 5.1 目标

让 `run-claimed-agent-prompts.mjs` 支持受控并行执行：

- `--parallel 1`
- `--parallel 2`
- `--parallel 3`
- `--parallel 5`

默认仍为 `--parallel 1`，保持当前串行安全模式。

### 5.2 并发边界

每个 Agent 必须拥有：

- 独立 worktree。
- 独立 prompt。
- 独立 run log。
- 独立 task/result event。

并发执行时不得多个 Agent 写同一个 queue JSON。V2-B 必须依赖 V2-A 的事件化结果写入，或在兼容期把 queue JSON 写入集中到 orchestrator。

### 5.3 失败策略

失败策略：

1. 任一 Agent exit code 非 0 后，停止启动后续未开始任务。
2. 已启动任务允许自然完成。
3. 聚合 summary 必须标记 success / failed / skipped / not-started。
4. 不自动 merge。
5. 不自动 push。
6. 不执行 deploy 或 production operation。

### 5.4 输出

Runner 必须输出：

- 每个 task 的 command。
- 每个 task 的 worktree。
- 每个 task 的 prompt file。
- 每个 task 的 run log。
- 每个 task 的 exit code。
- 聚合 summary。
- 失败原因和停止策略说明。

## 6. V2 任务拆解

| Task ID | Agent | 方向 | 优先级 | 风险 |
|---|---|---|---|---|
| `AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH` | agent-5 | Event Sourcing 总体架构与兼容层 | P0 | MEDIUM |
| `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS` | agent-3 | Read model / status 汇总 / conflict-free results | P0 | MEDIUM |
| `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER` | agent-4 | Parallel Runner CLI 参数、日志、状态输出 | P1 | MEDIUM |
| `AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT` | agent-2 | 验证矩阵、回归计划、兼容性测试计划 | P1 | MEDIUM |

## 7. 验收标准

V2 第一轮规划完成后，应满足：

1. V2-A 和 V2-B 的 REQ / TECH 已形成。
2. `task-queue.json` 中包含 4 个 READY 任务。
3. 每个任务有 owner、priority、risk、allowed_paths、forbidden_paths、acceptance、validation_commands、required_checks、expected_output_files。
4. `parallel-task-board.md` 包含 V2 batch 和执行建议。
5. 当前 JSON queue / locks / results 仍可 parse。
6. `check-dispatch-status` 和 `agent-cycle --dry-run` 仍可运行。
7. `pnpm typecheck` 通过。

## 8. 安全门禁

V2 不改变以下规则：

- HIGH 风险路径必须人工确认。
- 不允许无人值守 deploy。
- 不允许生产 migration / seed / cleanup / reset。
- 不允许绕过 Codex CLI approval。
- 不允许多个 Agent 并发写共享 queue JSON。
- 不允许把 secrets、tokens、生产密码写入事件文件、日志或报告。
