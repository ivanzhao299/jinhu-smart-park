# Agent Orchestrator Maturity Roadmap

本文档评估当前 Agent Orchestrator 的成熟度，并列出下一阶段建设目标与预计剩余工作量。

## 成熟度总览

| 能力域 | 当前完成度 | 当前状态 | 下一阶段目标 | 预计剩余工作量 |
|---|---:|---|---|---|
| Task Orchestration | 80% | 已支持自然语言 intake、REQ / TECH、task queue、locks、results、dispatch 和 status。 | 增加 schema 校验、任务依赖关系、批次级验收、失败自动转 follow-up task。 | M |
| Codex Runner | 75% | 已支持 CLI 检测、参数动态适配、prompt plan、串行 `--apply --execute`、run log 和失败停止。 | 增加执行超时、重试策略、并发安全队列、运行后自动摘要和失败分类。 | M |
| Auto Commit | 75% | 已支持 dirty agent 检测、allowed/forbidden path 校验、LOW / MEDIUM / HIGH 风险分级、Agent 分支自动提交。 | 增加 commit 内容摘要、task result 与 commit hash 自动回填、跨 Agent 重复文件检测。 | S-M |
| Integration Engine | 70% | 已支持 integration 分支、固定 Agent 顺序、LOW / MEDIUM 自动合并、queue bookkeeping 冲突自动 reconcile、integration report。 | 增加冲突预判、按文件所有权排序、integration branch 生命周期清理、main merge 前差异审计。 | M |
| Validation Engine | 60% | 已支持 dispatch status、audit all results dry-run、typecheck 和部分 changed-file 触发 e2e。 | 建立 changed files 到测试矩阵的完整映射，加入 lint/build/unit/e2e/release smoke 分层门禁。 | M-L |
| Release Engine | 25% | 已有生产证据计划、发布验收文档和部分 release gate 设计；未自动执行生产 deploy。 | 在人工批准后自动执行 preflight、backup、tag、deploy、health、smoke、rollback-ready check 和发布报告。 | L |

工作量标记：

- `S`: 1-2 个小任务。
- `M`: 3-5 个任务。
- `L`: 6 个以上任务或需要生产演练。

## 1. Task Orchestration

### 当前完成度

80%。

已完成：

- 自然语言需求可沉淀到 `intake/current-request.md`。
- REQ / TECH 文档模板已建立。
- `task-queue.json` 支持 owner、priority、status、risk、allowed_paths、forbidden_paths、acceptance 和 validation_commands。
- `task-locks.json` 支持 active lock。
- `task-results.json` 与 per-task result 文件已并存。
- `dispatch-ready-agents.mjs` 可自动 claim READY 任务并生成 prompt。

### 下一阶段目标

- 对 `task-queue.json` 强制执行 JSON schema 校验。
- 支持任务依赖，例如 `depends_on` 和 batch-level gate。
- 支持失败任务自动生成 follow-up queue entry。
- 支持批次级 Go / Conditional-Go / No-Go 汇总。

### 预计剩余工作量

M。

## 2. Codex Runner

### 当前完成度

75%。

已完成：

- 支持 `CODEX_CLI`、PATH、Codex.app 内置路径检测。
- 支持 `codex exec --help` 动态适配 CLI 参数。
- 支持 `--dry-run`、`--apply`、`--apply --execute` 分层门禁。
- 支持串行执行 claimed prompts。
- 每个任务生成 `.run.log`，exit code 非 0 时停止后续任务。

### 下一阶段目标

- 增加单任务超时与超时日志。
- 增加失败原因分类，例如 CLI 缺失、approval 中断、验证失败、路径越界。
- 增加可配置并发，但默认仍串行。
- 将 run log 自动摘要写入 result 文件。

### 预计剩余工作量

M。

## 3. Auto Commit

### 当前完成度

75%。

已完成：

- `commit-agent-results.mjs --dry-run` 可扫描 agent dirty files。
- 可根据 task-locks / task-results / task-queue 推断当前任务。
- 可校验 allowed_paths / forbidden_paths。
- 可按 LOW / MEDIUM / HIGH 风险分级。
- `--apply` 只提交 LOW / MEDIUM，不 push、不 merge。

### 下一阶段目标

- 自动把 agent commit hash 回填到 per-task result。
- 提交前生成 changed-file 摘要。
- 检测多个 Agent 是否改同一非 queue 文件。
- 对 MEDIUM 风险要求额外验证命令。

### 预计剩余工作量

S-M。

## 4. Integration Engine

### 当前完成度

70%。

已完成：

- `integrate-agent-results.mjs --dry-run` 输出待合并 commits、changed files 和风险等级。
- `--apply` 可创建 integration 分支。
- 按 `agent-2 -> agent-3 -> agent-4 -> agent-5` 合并。
- HIGH 风险自动停止。
- queue bookkeeping 冲突可自动保留 integration 版本并运行 reconcile。
- 集成后自动运行 dispatch status、audit all results 和 typecheck。
- 生成 integration report。

### 下一阶段目标

- 在 merge 前预测冲突，而不是 merge 时才发现。
- 将 integration report 纳入统一 release gate。
- 支持 integration branch 清理策略。
- 支持 main merge 前自动 diff 审计。

### 预计剩余工作量

M。

## 5. Validation Engine

### 当前完成度

60%。

已完成：

- `run-validation-matrix.mjs` 可运行 dispatch status。
- 可运行 `audit-all-results.mjs --dry-run`。
- 可运行 `pnpm typecheck`。
- 已支持部分 changed-file 触发 e2e。

### 下一阶段目标

- 建立完整 changed-files 到验证命令映射。
- 按 domain 自动选择 API smoke、Web smoke、financial regression、RBAC smoke、IoT smoke。
- 将 lint、build、unit test、e2e、release smoke 分层。
- 形成机器可读 validation report。

### 预计剩余工作量

M-L。

## 6. Release Engine

### 当前完成度

25%。

已完成：

- 已有生产证据计划、发布验收文档、rollback readiness 讨论和 release gate 方向。
- 当前自动化明确禁止无人值守 production deploy、migration、seed、cleanup、reset。

### 下一阶段目标

- 在人工批准后执行 production preflight。
- 自动检查 migration history、seed baseline、admin bootstrap、health check。
- 自动创建 backup、rollback tag 和 release report。
- 自动执行容器内登录验证、文件 upload/download/delete smoke。
- 失败时自动进入 rollback-ready report，而不是直接执行破坏性回滚。

### 预计剩余工作量

L。

## 近期建议

1. 优先补齐 Validation Engine 的 changed-file 测试矩阵。
2. 将 integration report 与 validation report 合并为 release gate report。
3. 给 Release Engine 增加 dry-run-only 的 `release-gate` 子命令。
4. 在所有生产操作前继续保持人工确认。

## 目标状态

成熟后的 Agent Orchestrator 应支持：

```text
一句自然语言需求
↓
自动生成 REQ / TECH
↓
自动生成 task queue
↓
自动调度 Agent
↓
自动执行与提交
↓
自动集成与验证
↓
自动生成验收结论
↓
人工批准发布
↓
自动发布、监控、回滚准备
```

该路线图以安全为第一优先级：LOW / MEDIUM 风险尽量自动化，HIGH 风险和生产操作必须保留人工确认。
