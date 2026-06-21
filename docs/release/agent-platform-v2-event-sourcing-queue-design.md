# Agent Platform V2 Event Sourcing Queue Design

## 1. 目标

Agent Platform V2-A 的目标是把 Agent Orchestrator 的任务状态从“多个 Agent 共同写共享 JSON”升级为“append-only 事件优先，兼容 JSON read model 输出”。第一阶段只建立事件目录、事件模型、bootstrap adapter 和 read model 生成能力，不改动现有 dispatch、complete、audit、integrate 的核心写路径。

本阶段要解决的问题：

- 降低 `task-queue.json`、`task-locks.json`、`task-results.json` 的多 Agent 冲突概率。
- 让每个任务、结果、审计状态可以独立追加事件。
- 保留现有 JSON 队列作为兼容层，确保 `agent-cycle`、`doctor`、`check-dispatch-status` 等命令继续可用。
- 为后续 parallel runner 的安全并发执行提供基础。

## 2. 非目标

本阶段不做：

- 不修改 `apps/**`、`packages/**`、`database/**`、`infra/**`、`.github/**`、Docker、auth、deploy。
- 不新增 migration。
- 不执行 Agent。
- 不执行 deploy、production migration、production seed、cleanup、reset。
- 不把现有脚本一次性切换为 event write path。
- 不删除现有 queue JSON。

## 3. 事件目录

第一阶段创建以下目录：

```text
ops/agent-orchestrator/events/
├── .gitkeep
├── tasks/
│   └── .gitkeep
├── results/
│   └── .gitkeep
├── locks/
│   └── .gitkeep
└── audits/
    └── .gitkeep
```

当前实现把 task lifecycle 事件写入：

```text
ops/agent-orchestrator/events/tasks/<task_id>/<timestamp>-<event_type>-<event_hash>.json
```

`results/`、`locks/`、`audits/` 目录先作为 V2 schema 边界保留。第二阶段可以将 per-result、per-lock、per-audit artifact 拆出到这些目录，同时继续让 task lifecycle 事件引用它们。

## 4. 事件类型

第一阶段定义以下事件类型：

| Event Type | 含义 | 典型 status_after |
|---|---|---|
| `task.created` | 任务进入事件流 | `READY`、历史 bootstrap 状态 |
| `task.claimed` | Agent 领取任务并产生 active lock | `CLAIMED` |
| `task.started` | Agent 开始执行任务 | `IN_PROGRESS` |
| `task.completed` | Agent 任务完成 | `DONE` |
| `task.failed` | Agent 任务失败 | `FAILED` |
| `task.blocked` | 任务被阻断 | `BLOCKED` |
| `task.deferred` | 任务被延后，不作为当前主线领取 | `BLOCKED` 或自定义 deferred reason |
| `task.audited` | Orchestrator 审计通过 | `AUDITED` |
| `task.integrated` | Agent 成果已进入 integration / main | `DONE` 或 `AUDITED` |
| `task.reconciled` | Queue/result/lock read model 已被统一修复 | 当前状态 |

## 5. 事件字段

每个事件文件使用 JSON，建议字段如下：

```json
{
  "event_id": "uuid-or-deterministic-id",
  "event_type": "task.completed",
  "task_id": "AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH",
  "owner": "agent-5",
  "status_before": "CLAIMED",
  "status_after": "DONE",
  "created_at": "2026-06-22T00:00:00.000Z",
  "actor": "agent-5",
  "source": "complete-task.mjs",
  "reason": "agent completed task",
  "changed_files": [
    "ops/agent-orchestrator/scripts/lib/event-store-utils.mjs"
  ],
  "result_ref": "ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH.json",
  "audit_ref": "",
  "metadata": {}
}
```

字段说明：

- `event_id`：事件唯一标识。Bootstrap 阶段使用确定性 ID，普通 append 可使用 UUID。
- `event_type`：必须是受支持的 task lifecycle 事件类型。
- `task_id`：任务唯一标识。
- `owner`：任务 owner 或事件 actor 对应的 agent。
- `status_before` / `status_after`：状态迁移边界。Read model 以 `status_after` 作为最终状态来源。
- `created_at`：事件时间，也是排序依据。
- `actor`：写入事件的主体，如 `agent-5` 或 `orchestrator`。
- `source`：事件来源脚本，如 `bootstrap-event-store`。
- `reason`：状态变化原因。
- `changed_files`：任务真实产出文件列表。
- `result_ref`：对应 per-task result artifact。
- `audit_ref`：对应 audit artifact。
- `metadata`：兼容快照、queue index、lock snapshot、result snapshot 等扩展信息。

## 6. Append-Only 规则

事件文件必须 append-only：

- 不覆盖已有事件文件。
- 不通过编辑旧事件来修复状态。
- 需要修正时追加 `task.reconciled` 或新的状态事件。
- 文件名包含 timestamp、event type 和 event hash，避免并发写入同名文件。
- Bootstrap 事件使用确定性 `event_id`，重复执行会跳过已有事件。

## 7. 兼容 JSON Read Model

现有兼容层继续保留：

```text
ops/agent-orchestrator/queue/task-queue.json
ops/agent-orchestrator/queue/task-locks.json
ops/agent-orchestrator/queue/task-results.json
```

新增 read model 能力：

- `buildQueueReadModel()`：从 task events 生成 `task-queue.json` 兼容结构。
- `buildLockReadModel()`：从 `task.claimed` / `task.started` 和最终状态生成 active locks。
- `buildResultReadModel()`：从 `task.completed` / `task.failed` 生成 result aggregate。
- `writeCompatibilityReadModels()`：集中写回三份兼容 JSON。

当前阶段如果事件目录没有事件，read model 会回退读取现有 JSON，避免破坏现有流程。

## 8. Bootstrap Adapter

新增脚本：

```bash
node ops/agent-orchestrator/scripts/bootstrap-event-store.mjs --dry-run
node ops/agent-orchestrator/scripts/bootstrap-event-store.mjs --apply
```

行为：

- 从当前 `task-queue.json` 为每个 task 生成 `task.created` bootstrap event。
- 从当前 `task-locks.json` 为 active lock 生成 `task.claimed` bootstrap event。
- 从当前 `task-results.json` 为历史结果生成 `task.completed` 或 `task.failed` bootstrap event。
- `--dry-run` 只输出摘要，不写事件。
- `--apply` 才写入事件文件。
- 重复执行时按 deterministic `event_id` 跳过已存在事件。

## 9. Read Model Rebuild

新增脚本：

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --apply
```

行为：

- 从 `events/tasks/**` 汇总 queue / locks / results read model。
- `--dry-run` 输出 diff summary，不写兼容 JSON。
- `--apply` 才写回兼容 JSON。
- 保留 `updated_at`，并根据事件时间推进 aggregate 的 `updated_at`。
- 输出结构保持现有 JSON schema 兼容。

## 10. 迁移路线

建议分阶段推进：

1. Phase A0：提交事件目录和事件模型文档。
2. Phase A1：提交 event-store-utils、bootstrap、read model rebuild 脚本。
3. Phase A2：dry-run 验证 bootstrap 与 rebuild 不破坏现有 JSON 兼容。
4. Phase A3：让 `complete-task.mjs` 同时写 per-task result event，仍由 orchestrator 集中重建 JSON。
5. Phase A4：让 `claim-task.mjs` / `dispatch-ready-agents.mjs` 写 claim event。
6. Phase A5：让 audit / integrate / reconcile 使用事件 read model。
7. Phase A6：parallel runner 才允许多个 Agent 并发完成任务，但共享 JSON 只由 orchestrator 统一生成。

## 11. 安全边界

- HIGH 风险路径仍必须人工确认。
- 事件文件不得包含 secrets、tokens、生产密码、生产连接串。
- 不允许把 production deploy、migration、seed、cleanup、reset 封装成无人值守事件。
- 不允许 Agent 并发直接写 `task-queue.json`、`task-locks.json`、`task-results.json`。
- 兼容 JSON 写入必须集中在 orchestrator read model 阶段。

## 12. 当前阶段验收

第一阶段完成后应满足：

- 事件目录存在并可提交。
- `event-store-utils.mjs` 通过 `node --check`。
- `bootstrap-event-store.mjs --dry-run` 可输出 planned events。
- `rebuild-queue-read-model.mjs --dry-run` 可输出 compatibility diff summary。
- `check-dispatch-status`、`doctor`、`agent-cycle --dry-run` 继续可运行。
- `pnpm typecheck` 通过。
- 没有业务代码变更。
