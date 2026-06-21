# TECH: Agent Platform V2

## 1. 技术目标

Agent Platform V2 通过事件化队列和受控并行执行，降低多 Agent 协作时的共享 JSON 冲突，提高吞吐量，同时保持现有 orchestrator 命令、JSON 兼容层和人工安全门禁。

## 2. V2-A Event Sourcing Queue

### 2.1 目录结构

```text
ops/agent-orchestrator/events/
├── tasks/
├── results/
├── locks/
└── audits/
```

建议增加 `.gitkeep` 保持空目录可提交。

### 2.2 文件命名

建议：

- Task event: `events/tasks/<task_id>.task.json`
- Lock event: `events/locks/<task_id>.<agent>.lock.json`
- Result event: `events/results/<task_id>.<agent>.result.json`
- Audit event: `events/audits/<task_id>.audit.json`

后续如果一个 task 需要多个事件版本，可扩展为：

```text
events/tasks/<task_id>/<timestamp>.<event_type>.json
```

### 2.3 Event Schema

基础字段：

```json
{
  "schema_version": 1,
  "event_id": "20260621T214500Z-task-id-event-type",
  "event_type": "task.created",
  "task_id": "TASK-ID",
  "agent": "agent-5",
  "created_at": "2026-06-21T21:45:00+08:00",
  "source": "orchestrator",
  "payload": {}
}
```

事件类型建议：

- `task.created`
- `task.claimed`
- `task.started`
- `task.completed`
- `task.failed`
- `task.blocked`
- `task.audited`
- `result.recorded`
- `lock.created`
- `lock.released`
- `audit.passed`
- `audit.failed`

### 2.4 Read Model

Read model 由事件生成当前状态：

- queue task list。
- locks list。
- results list。
- audit summary。
- per-agent active lock。
- batch summary。

兼容输出：

- `queue/task-queue.json`
- `queue/task-locks.json`
- `queue/task-results.json`

规则：

1. Event files 是事实源。
2. Queue JSON 是 materialized read model。
3. Agent 并发执行时只写独立 event/result 文件。
4. 共享 JSON 只由 orchestrator 汇总脚本写入。

### 2.5 Adapter Strategy

需要新增或改造的 adapter：

- `readEvents()`
- `writeTaskEvent()`
- `writeResultEvent()`
- `writeLockEvent()`
- `writeAuditEvent()`
- `buildQueueReadModel()`
- `writeLegacyQueueJson()`

建议位置：

- `ops/agent-orchestrator/scripts/lib/queue-utils.mjs`
- 或新增 `ops/agent-orchestrator/scripts/lib/event-store-utils.mjs`

### 2.6 Script Retrofit

第一批需要评估和改造：

| Script | V2 改造点 |
|---|---|
| `claim-task.mjs` | 写 lock event，兼容更新 legacy locks |
| `dispatch-ready-agents.mjs` | 写 task claimed / lock events |
| `complete-task.mjs` | 写 result event，不直接要求写共享 result JSON |
| `audit-agent-result.mjs` | 写 audit event |
| `audit-all-results.mjs` | 从 read model 读取 DONE tasks 和 results |
| `check-dispatch-status.mjs` | 从 read model 输出 status |
| `reconcile-task-results.mjs` | 从事件重建 legacy JSON |
| `commit-agent-results.mjs` | 读取 task/result event 与 legacy queue |
| `integrate-agent-results.mjs` | queue conflict 降级为 read model regenerate |
| `run-validation-matrix.mjs` | 验证 event store 和 legacy JSON 一致性 |
| `orchestratorctl.mjs` | agent-cycle 中加入 event read model gate |

### 2.7 Migration Plan

1. A0：创建事件目录和 schema 文档。
2. A1：从现有 JSON 生成 bootstrap events。
3. A2：实现 read model builder dry-run。
4. A3：read model builder 输出 legacy JSON。
5. A4：`complete-task.mjs` 先写 event，再更新 legacy JSON。
6. A5：`claim/dispatch/audit` 改为 event-first。
7. A6：parallel runner 只允许在 event-first 模式下并发写结果。

## 3. V2-B Parallel Agent Execution

### 3.1 CLI

`run-claimed-agent-prompts.mjs` 增加：

```bash
--parallel 1
--parallel 2
--parallel 3
--parallel 5
```

默认：

```bash
--parallel 1
```

非法值必须失败，例如 `--parallel 0`、`--parallel 4`、`--parallel all`。

### 3.2 Execution Model

输入：

- CLAIMED tasks。
- active locks。
- prompt files。
- agent worktree paths。
- Codex CLI path。

调度：

1. 按 task priority / created_at / owner 排序。
2. 按 `parallel` 限制启动并发。
3. 每个 Agent 独立子进程。
4. stdout / stderr 写入该任务 run.log。
5. 任一任务失败后，不再启动新任务。
6. 已启动任务继续等待完成。

### 3.3 Summary

聚合 summary 字段：

- `task_id`
- `agent`
- `worktree`
- `prompt_file`
- `log_file`
- `started_at`
- `finished_at`
- `exit_code`
- `status`: `success` / `failed` / `skipped` / `not_started`
- `failure_reason`

### 3.4 Safety

并发 runner 继续禁止：

- merge。
- push。
- deploy。
- production migration。
- production seed。
- cleanup / reset。
- production file delete。
- 绕过 Codex CLI approval。

### 3.5 Event Dependency

并发执行只有在以下条件满足时才允许写完成状态：

1. Agent 结果写入独立 event/result 文件。
2. 不直接并发写 `task-results.json`。
3. Queue JSON 由 read model builder 统一生成。

在 V2-A 未完成前，`--parallel > 1` 应保持 dry-run-only 或明确阻断。

## 4. Verification Strategy

最低验证：

```bash
node --check ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 1
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 2
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
```

Event store 验证：

- JSON parse all event files。
- Detect duplicate `event_id`。
- Detect duplicate active locks。
- Read model output equals legacy queue for unchanged tasks。
- Corrupt event must fail loudly in validation mode。

## 5. Rollout / Rollback

Rollout：

1. Docs and specs。
2. Event directory and schema。
3. Read model dry-run。
4. Legacy JSON generation。
5. Event-first complete / claim / audit。
6. Parallel runner dry-run。
7. Parallel runner execute after event-first is stable。

Rollback：

- Keep legacy JSON as compatibility source until V2 is stable。
- Disable `--parallel > 1` by default。
- Revert to `--parallel 1` serial execution。
- Rebuild read model from legacy JSON if event migration fails。

## 6. Open Questions

1. Event ID 使用 timestamp 还是 UUID。
2. 是否允许一个 task 多个 result event。
3. audit event 是否每次运行都保留，还是只保留 latest。
4. read model 是否提交到 git，还是作为生成产物。
5. parallel runner 是否允许跨 batch 并发。
