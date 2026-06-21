# Agent Orchestrator Playbook V1

本文档定义 Jinhu Smart Park 多 Agent 交付工厂的第一版标准作业流程。目标是让项目负责人只输入自然语言需求，总控即可生成需求、拆解任务、调度 Agent、执行开发、收集结果、自动集成、验证并准备进入 main。

## 1. 当前架构说明

### main

`main` 是主线工作区，承担需求拆解、任务队列维护、Agent 调度、集成验证和最终发布门禁职责。除非显式进入受控 `--push` 流程，`main` 不自动推送、不部署、不执行生产数据操作。

### agent-1

`agent-1` 负责资产、房源、租户、空间关系等数据域任务。当前标准流程中，只有 task queue 中明确分配给 `agent-1` 的 READY 任务才会被调度。

### agent-2

`agent-2` 负责招商、合同、应收、收款、发票、减免等财务与合同域任务。金融相关任务默认需要更严格的审计、幂等性和回归检查。

### agent-3

`agent-3` 负责工单、安全、IoT、能耗、联动执行器等运营与设备域任务。涉及生产联动、告警、设备动作的任务必须保持 dry-run 或人工确认门禁。

### agent-4

`agent-4` 负责驾驶舱、移动端、菜单权限、RBAC、回归验收等体验与权限可见性任务。

### agent-5

`agent-5` 负责测试回归、发布验收、生产稳定性检查、上线门禁、备份、回滚和 smoke 方案。

### task-queue

`ops/agent-orchestrator/queue/task-queue.json` 是机器可读任务池。每个任务至少包含 `task_id`、`owner`、`status`、`priority`、`risk`、`allowed_paths`、`forbidden_paths`、`validation_commands` 和人工审批标记。

### task-locks

`ops/agent-orchestrator/queue/task-locks.json` 记录 Agent 已领取任务。一个 Agent 有 active lock 时不会继续领取新任务，避免同一 worktree 并发写入。

### task-results

`ops/agent-orchestrator/queue/task-results.json` 是兼容型聚合结果；首选单任务结果文件位于 `ops/agent-orchestrator/results/<task_id>.json`。queue bookkeeping 文件由 orchestrator 维护，不作为 Agent 越界审计依据。

### integration branch

`integration/orchestrator-auto-YYYYMMDD-HHMMSS` 是多 Agent 成果自动合并与验证分支。LOW / MEDIUM 风险可进入自动集成，HIGH 风险必须人工确认。

### Codex CLI Runner

`run-claimed-agent-prompts.mjs` 通过 Codex CLI 串行执行已 CLAIMED 的 Agent prompt。Runner 动态检测 Codex CLI 参数，不绕过 approval，不执行 merge、push、deploy 或生产数据操作。

## 2. 标准开发流程

```text
自然语言需求
↓
REQ
↓
TECH
↓
Task Queue
↓
Dispatch
↓
Claim
↓
Codex Execute
↓
Agent Commit
↓
Integration
↓
Validation
↓
Main Merge
↓
Push
↓
Sync Agents
```

标准流程说明：

1. 项目负责人输入自然语言需求。
2. 总控写入 `intake/current-request.md`，生成正式 REQ / TECH。
3. 总控生成 `task-queue.json`，明确 owner、路径边界、验收标准和验证命令。
4. `dispatch-ready-agents.mjs` 自动扫描 READY 任务、写入 locks、生成 prompt。
5. `run-claimed-agent-prompts.mjs --apply --execute` 串行调用 Codex CLI。
6. Agent 完成后写入 result，生成本地改动。
7. `commit-agent-results.mjs --apply` 将 LOW / MEDIUM 风险成果提交到 agent 分支。
8. `integrate-agent-results.mjs --apply` 创建 integration 分支，按 Agent 顺序合并。
9. 集成分支运行 dispatch status、result audit、typecheck 和可选 e2e。
10. 验证通过后，才允许 main merge / push / sync agents。

## 3. 常用命令速查

### 3.1 查看状态

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs status
```

### 3.2 查看流水线计划

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
```

### 3.3 自动执行（不推送）

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute
```

该命令可以执行已 CLAIMED 的 Agent prompts、提交符合规则的 Agent 结果、创建 integration 分支并运行验证，但不会 push。

### 3.4 自动执行并推送

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute --push
```

该命令只有在验证通过后才允许合回 main、push `origin/main` 并同步 Agent worktree。仍然不会执行 production deploy、production migration、production seed、数据库 reset、cleanup 或生产文件删除。

## 4. 故障处理

### Agent Dirty

现象：Agent worktree 有未提交文件，集成前检查失败。

处理：

1. 运行 `node ops/agent-orchestrator/scripts/commit-agent-results.mjs --dry-run`。
2. 确认 dirty files 与当前 task 的 `allowed_paths` / `forbidden_paths` 匹配。
3. LOW / MEDIUM 风险可运行 `commit-agent-results.mjs --apply`。
4. HIGH 风险必须人工确认，不自动提交。

### Queue Conflict

现象：集成多个 Agent 时，`task-queue.json`、`task-locks.json` 或 `task-results.json` 冲突。

处理：

1. `integrate-agent-results.mjs --apply` 仅对 queue bookkeeping 文件允许自动处理。
2. 自动保留 integration 分支当前版本。
3. 自动运行 `reconcile-task-results.mjs --apply` 统一修复任务状态。
4. 非 queue 冲突立即停止。

### Codex CLI Failure

现象：Agent runner exit code 非 0。

处理：

1. 查看 `ops/agent-orchestrator/runs/<task_id>-<agent>.run.log`。
2. 修复 prompt、环境、权限或任务边界。
3. 不继续执行后续 Agent。
4. 不进入自动集成。

### Validation Failure

现象：`check-dispatch-status`、`audit-all-results --dry-run`、`pnpm typecheck` 或 e2e 失败。

处理：

1. 停止合回 main。
2. 阅读 integration report 和失败命令输出。
3. 生成修复任务或人工修复。
4. 验证未全部通过前禁止 push。

### Integration Conflict

现象：非 queue bookkeeping 文件冲突。

处理：

1. 自动流程停止。
2. 保留错误输出。
3. 人工审查冲突文件、业务风险和 Agent 责任归属。
4. 必要时重新拆分任务。

### High Risk Change

现象：改动命中 `apps/**`、`packages/**`、`database/**`、`infra/**`、Docker、auth、deploy 等路径。

处理：

1. 自动提交或自动集成都必须停止。
2. 项目负责人确认风险、回滚方案和验证范围。
3. 需要单独任务、单独审批、单独测试。

## 5. 风险等级

### LOW

低风险通常包括：

- `docs/**`
- `ops/agent-orchestrator/reports/**`
- `ops/agent-orchestrator/results/**`

LOW 可自动提交并进入 integration，但仍需验证通过。

### MEDIUM

中风险通常包括：

- `ops/agent-orchestrator/queue/**`
- `ops/agent-orchestrator/scripts/**`
- `docs/testing/**`
- `scripts/e2e/**`

MEDIUM 可自动进入 integration，但必须通过验证矩阵。

### HIGH

高风险通常包括：

- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `.github/**`
- Docker、auth、deploy 相关路径

HIGH 不允许自动集成，必须人工确认。

## 6. 哪些情况必须人工确认

以下路径或行为必须人工确认：

- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `docker/**`
- `Dockerfile`
- `docker-compose*`
- `auth/**`
- `deploy/**`
- production deploy
- production migration
- production seed
- production cleanup / reset
- 生产文件删除
- 真实生产数据写入

## 7. 下一阶段路线图

### Phase 1: Agent 自动开发

自然语言需求自动转 REQ / TECH / task queue，Agent 根据 prompt 自动执行开发或文档任务。

### Phase 2: Agent 自动集成

Agent 结果自动提交、自动进入 integration 分支、自动处理 queue bookkeeping 冲突。

### Phase 3: Agent 自动测试

根据 changed files、task domain 和 risk 自动选择 typecheck、unit、smoke、e2e、release gate。

### Phase 4: Agent 自动验收

自动生成验收报告、Go / Conditional-Go / No-Go 判断、剩余风险和人工确认清单。

### Phase 5: Agent 自动发布

在人工批准后执行受控发布流程，包括 preflight、backup、tag、health check、smoke 和 release report。

### Phase 6: Agent 自动回滚

在失败门禁触发后执行受控 rollback plan，恢复代码、数据库备份和文件备份，并输出回滚报告。

### Phase 7: Agent 自动监控

发布后自动巡检服务健康、日志、关键业务 smoke、异常告警和容量指标。

## 8. 最终目标

```text
一句自然语言需求
↓
自动拆解
↓
自动开发
↓
自动测试
↓
自动集成
↓
自动发布
↓
自动回滚
```

最终目标不是取消人工决策，而是把重复、低风险、可验证的操作交给自动化，把人工注意力留给高风险变更、生产操作、发布决策和异常处理。
