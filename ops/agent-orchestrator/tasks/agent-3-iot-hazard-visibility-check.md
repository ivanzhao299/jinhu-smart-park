# Agent Task: IoT Hazard Visibility Check

## Target Agent
agent-3

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-3

## Branch
agent-3-ops-iot-safety

## Task Goal
诊断 IoT 规则自动创建的安全隐患是否能在以下业务视图中正常可见，并输出证据链和阻塞点：

1. 安全隐患列表
2. 租户360
3. 房源安全记录
4. Dashboard 指标

本轮只做诊断，不修代码。

## Strict Boundaries
1. 只诊断，不改业务代码。
2. 不新增 migration。
3. 不修改旧 migration。
4. 不修改业务 service。
5. 不修改 auth / CI / Docker / deploy / 短信 / 微信配置。
6. 不提交 commit。
7. 不提交 secrets、token、密码或真实生产数据。
8. 如果发现问题，只输出根因判断、影响面、建议修改点和建议验证命令，不直接修复。

## Files To Inspect
优先从当前代码中确认真实路径；以下是建议入口，不代表唯一范围：

- apps/api/src/modules/iot
- apps/api/src/modules/safety
- apps/api/src/modules/dashboard
- apps/api/src/modules/tenants
- apps/api/src/modules/assets
- apps/web/app
- apps/web/components
- packages/shared
- scripts/e2e

## Diagnostic Checklist
1. 确认 IoT 规则动作 `CREATE_SAFETY_HAZARD` 当前是否真实创建安全隐患，而不是 `SIMULATED`。
2. 追踪自动创建的安全隐患字段：tenant、asset、unit、space、source、status、severity、createdAt 等关联字段是否足够支撑各视图查询。
3. 检查安全隐患列表查询条件是否会包含 IoT 自动创建记录。
4. 检查租户360是否通过 tenant 关联或间接关联展示该隐患。
5. 检查房源安全记录是否通过 unit / space / asset 关联展示该隐患。
6. 检查 Dashboard 安全隐患指标是否统计该类记录，包含状态、时间范围、租户/园区过滤等条件。
7. 检查现有 e2e / regression 是否覆盖该可见性链路；如果没有，指出缺口。
8. 不改代码；所有结论必须来自代码阅读、现有脚本输出或只读查询证据。

## Suggested Read-Only Commands
根据实际需要选择执行；禁止执行会写库、改文件或提交的命令。

```bash
git status --short
git branch --show-current
rg -n "CREATE_SAFETY_HAZARD|SIMULATED|hazard|隐患|safety" apps/api apps/web packages/shared scripts
rg -n "tenant360|Tenant360|relatedUnits|unit-status|dashboard|statistics" apps/api apps/web packages/shared scripts
pnpm typecheck
```

如果需要运行 e2e，只允许运行只读或可安全清理的本地回归，并在报告中明确说明数据影响和清理方式。typecheck 或 e2e 失败时必须报告，不允许建议 push。

## Final Report Required
1. Worktree 状态：分支、HEAD、是否 clean。
2. 诊断结论：四个视图分别是“可见 / 不可见 / 证据不足”。
3. 证据链：自动创建记录从 IoT 规则到各视图查询的代码路径。
4. 阻塞项：缺字段、缺关联、过滤条件不匹配、权限/菜单不可达、测试缺口等。
5. 建议修改点：只写建议，不实施。
6. 验证命令：实际运行的命令、结果、失败原因。
7. 未执行检查及原因。
8. 剩余风险。

## Agent 3 Task Passphrase

```text
Agent 3，请在 /Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-3 的 agent-3-ops-iot-safety 分支执行 IoT 安全隐患可见性诊断。

目标：检查 IoT 规则自动创建的安全隐患是否能在安全隐患列表、租户360、房源安全记录、Dashboard 指标中正常可见。

硬性边界：本轮只诊断，不改代码；不新增 migration；不修改旧 migration；不修改业务 service；不修改 auth/CI/Docker/deploy/短信/微信配置；不提交 commit；不提交任何 secrets/token/密码。若发现问题，只输出根因、影响面、建议修改点和建议验证命令。

请先运行 git status --short 和 git branch --show-current 确认工作区状态，再按任务文件 ops/agent-orchestrator/tasks/agent-3-iot-hazard-visibility-check.md 的 Diagnostic Checklist 逐项检查，最后输出完整诊断报告。typecheck 或 e2e 如失败，必须标记为阻塞，禁止建议 push。
```
