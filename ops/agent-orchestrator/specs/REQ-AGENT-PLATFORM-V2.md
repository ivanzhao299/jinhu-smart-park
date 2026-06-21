# REQ: Agent Platform V2

## 1. 需求目标

将当前 Agent Orchestrator 从约 78% 成熟度提升到 85%+，重点解决多 Agent 写共享 JSON 的冲突问题，并为受控并行执行 Agent 任务奠定基础。

本轮仅进入规划与任务拆解阶段，不直接开发业务功能。

## 2. 范围

### V2-A Event Sourcing Queue

目标：

- 避免多个 Agent 同时修改 `task-queue.json`、`task-locks.json`、`task-results.json`。
- 引入事件化目录：
  - `ops/agent-orchestrator/events/tasks/`
  - `ops/agent-orchestrator/events/results/`
  - `ops/agent-orchestrator/events/locks/`
  - `ops/agent-orchestrator/events/audits/`
- 每个 task / result / audit 独立文件。
- 保留现有 JSON 队列作为兼容层。
- 通过 read model 汇总事件生成当前 queue status。
- 分阶段迁移，不一次性破坏现有流程。

### V2-B Parallel Agent Execution

目标：

- 扩展 `run-claimed-agent-prompts.mjs` 支持 `--parallel 1|2|3|5`。
- 默认继续使用 `--parallel 1`。
- 每个 Agent 独立 worktree、prompt、run.log。
- 并发执行时不得多个 Agent 写同一个 queue JSON。
- 任一 Agent 失败后停止启动后续任务，但允许已启动任务自然完成。
- 输出聚合 summary。

## 3. 非目标

本轮不做：

- 不修改 `apps/api`。
- 不修改 `apps/web`。
- 不修改 `packages`。
- 不修改 `database/migrations`。
- 不修改 `database/seeds`。
- 不修改 `infra`。
- 不修改 auth、CI、Docker、deploy。
- 不新增 migration。
- 不执行 Agent。
- 不 push。
- 不 merge。
- 不 deploy。
- 不执行 production migration / seed / cleanup / reset。

## 4. 角色与任务分配

| Agent | 职责 |
|---|---|
| agent-5 | Event Sourcing 总体架构与兼容层 |
| agent-3 | Event read model / status 汇总 / conflict-free results |
| agent-4 | Parallel Runner CLI 参数、日志、状态输出 |
| agent-2 | 验证矩阵、回归计划、兼容性测试计划 |

## 5. 功能需求

### 5.1 Event Sourcing Queue

1. 系统必须支持每个 task 独立事件文件。
2. 系统必须支持每个 result 独立事件文件。
3. 系统必须支持每个 lock 独立事件文件。
4. 系统必须支持每个 audit 独立事件文件。
5. 系统必须保留现有 JSON queue 作为兼容层。
6. 系统必须可以由事件文件生成 read model。
7. 系统必须明确迁移阶段和脚本改造清单。

### 5.2 Parallel Agent Execution

1. Runner 必须接受 `--parallel 1`、`--parallel 2`、`--parallel 3`、`--parallel 5`。
2. 默认并发度必须为 1。
3. Runner 必须保持串行安全模式。
4. Runner 必须为每个 Agent 写独立 run.log。
5. Runner 必须在失败后停止启动新任务。
6. Runner 必须允许已启动任务自然完成。
7. Runner 必须输出聚合 summary。
8. Runner 不得 merge、push、deploy 或执行 production operation。

## 6. 验收标准

1. `docs/release/AGENT_PLATFORM_V2_PLAN.md` 存在并覆盖 V2-A / V2-B。
2. `REQ-AGENT-PLATFORM-V2.md` 与 `TECH-AGENT-PLATFORM-V2.md` 存在。
3. `task-queue.json` 包含 4 个 V2 READY 任务。
4. `parallel-task-board.md` 包含 V2 batch 和 Agent 分配。
5. JSON queue / locks / results 可 parse。
6. `check-dispatch-status` 可运行。
7. `agent-cycle --dry-run` 可运行。
8. `pnpm typecheck` 通过。
9. `git diff --check` 通过。

## 7. 人工确认要求

以下情况必须人工确认：

- HIGH 风险路径。
- `apps/**`、`packages/**`、`database/**`、`infra/**`、auth、CI、Docker、deploy。
- 生产 deploy。
- 生产 migration。
- 生产 seed。
- cleanup / reset / destructive operation。
- 任何真实生产数据写入。
