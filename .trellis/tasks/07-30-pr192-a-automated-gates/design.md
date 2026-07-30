# PR192 A 自动化门禁设计

## 1. Boundary

该 runner 有两个可独立恢复的交付单元：

- `A-base-core provision` 输入 fixture contract/schema SHA、PR #192 现有 domain runtime
  和测试环境，页面前即可输出 A-base profile/checksum、provision evidence 与 fixture
  handoff SHA。
- `A-route-evidence` 输入上述 fixture handoff SHA，以及后续页面/menu/API final
  handoff，输出 technical gate verdict、traceability coverage、evidence bundle 和
  cleanup verdict。

整个任务可以从 A-base-core 开始，不能把页面冻结设为任务启动前置。任何 B schema
探测都必须是“确认未依赖”，不能变成 A 的必需能力。

## 2. Artifact Contract

建议统一放在 `scripts/e2e/property-remediation/`，实现时由唯一 owner 决定最终路径：

```text
profiles/a-base-v1.*
roles/a-exact-set.*
traceability/a-requirements.*
runs/<run-id>/summary.json
runs/<run-id>/evidence.json
runs/<run-id>/cleanup-manifest.jsonl
runs/<run-id>/artifacts/**
```

profile、role、traceability 和 evidence 都需要 JSON Schema 或等价运行时校验器。一个中央 decoder 拥有 JSON/JSONL 类型、规范化和重放；测试或报告器不得自行 cast 原始字段。core handoff manifest 记录 contract/schema/generator/profile checksum、commit、环境约束和 artifact hashes，并以其 canonical SHA 作为 fixture handoff SHA。

## 3. Dataset And Checksum

Dataset builder 以固定 seed、固定 Shanghai business clock 和 deterministic UUID/key 创建 A-base。checksum 输入按稳定键排序并包含：

```text
profile name/version
generator version
seed/business clock
table logical name + canonical rows
expected row counts/distribution
manifest schema version
```

敏感明文不进入 checksum 或日志。运行开始校验目标租户带有专用测试标记且环境 denylist 不包含 shared/staging/production；任一判断不确定即 fail closed。

## 4. Exact-set Oracle

每个角色使用相同管线采集实际集合：

```text
DB assignment -> /users/me -> enabled_modules
menu materialization -> visible routes
direct route -> page guard
HTTP endpoint -> module + permission + data/field/file projection
```

比较器对集合排序去重后执行双向差集；报告 `missing` 与 `unexpected`。模块可用性与权限提升分别断言，尤其覆盖 superuser + disabled module。字段和附件使用权限交集，不因业务权限推导通用文件权限。

## 5. Layered Execution

整体顺序为 A-base-core provision → 发布 fixture handoff SHA → homestay/housing
并行实现 → 页面/menu/API final handoff → A-route-evidence。A-route-evidence 内部运行
L0 → L1/L2/L3 → L4 → L5 → L6。前置数据或安全断言失败立即停止后续写操作，但仍进入 cleanup。每层输出独立 verdict 和 evidence IDs：

- L0 扫描共享权限常量、API 元数据、页面/菜单 manifest。
- L1/L2 使用当前测试框架覆盖纯策略和组件状态。
- L3 在真实 PostgreSQL 验证仅 Track A 约束与迁移重跑。
- L4 使用真实登录 token 和 HTTP，不用 service mock 证明授权。
- L5 使用浏览器覆盖 landing、深链、刷新、选择器、桌面/手机。
- L6 聚合 axe、viewport overflow、触控、性能、证据和清理。

## 6. UX And Performance Harness

浏览器矩阵为 desktop 与 320/360/390/768px。每个关键页面记录首屏、loading、首次空、筛选空、error、forbidden、partial-data 和成功状态截图；按 WCAG 2.2 AA 检查 focus order、label/name、键盘操作、对比度、非颜色反馈和横向溢出。

性能采用固定容器资源和 PG 参数，预热后运行 5 次，报告 median/p90/p95、最差值、样本和 trace。阈值文件有 owner、批准人、日期和变更原因；runner 不接受命令行临时放宽。

## 7. Crash-safe Cleanup

write-ahead manifest 每条记录有 run ID、sequence、resource type、tenant/park、deterministic key、state、timestamp、attempt 和 error。写入 `planned` 后 fsync，才允许创建资源。reducer 重放最后状态；启动、正常结束和信号 handler 都把 `created|cleanup_pending|failed` 资源送入幂等清理。清理后以 DB/API 双侧 residual scan 证明 0 残留。禁止按模糊名称、日期范围或全租户批量删除。

## 8. Traceability And Evidence

traceability validator 保证每条父需求至少有一个正向和最近反向测试，且测试产生 evidence。evidence bundle 包括运行上下文、逐层 verdict、命令/exit、日志、截图/trace/axe/perf 的 hash、cleanup manifest hash 和 residual query。artifact 缺失、hash 不匹配或证据引用悬空均为失败。

## 9. Subagent Batches

实现阶段最多三个并行批次，文件所有权不重叠：

1. `a-profile-owner`：先行 A-base-core builder、checksum、fixture handoff SHA、生产保护、cleanup/reconcile；不等待页面 owner。
2. `a-authz-owner`：收到页面/menu/API handoff 后执行 A-route-evidence 的 exact-set oracle、L0-L4 权限/范围/字段/文件矩阵。
3. `a-browser-evidence-owner`：在同一 route handoff 上执行 L5-L6、UX/axe/perf、traceability/evidence 报告。

批次合并后由独立 check agent 只读复核 profile 边界、双向差集、证据链与残留。任何 agent 不得修改其他 Track 的 task 目录。

每个单元以 checkpoint、immutable input SHA 和已完成 artifact hash 恢复。A-base-core
发布后可结束 owner；A-route-evidence 等待页面时不占用 core owner。core 不等待 route
完成，route 只消费 core handoff，页面只消费 core fixture，三者没有循环完成依赖。

## 10. Gate And Failure Policy

Gate aggregator 使用 AND 语义；skip 默认失败，只有父计划明确标记为该层“不适用”且带依据时才可接受。P0/P1 立即 stopship。失败报告必须保留已生成证据并完成清理，不能通过删日志、重跑覆盖或放宽阈值获得绿色结果。
