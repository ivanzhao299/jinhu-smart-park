# PR192 A 自动化门禁设计

## 1. Boundary

该 runner 有一个强制 bootstrap 前置和两个可独立恢复的交付单元：

- `A-ephemeral-db-bootstrap` 输入 migration tree，输出只允许 exact ephemeral
  container 的 `000001`–`000174` + `skip-record:000175` +
  `000176`–`000183` bootstrap SHA；必须先经独立 review。
- `A-base-core provision` 输入 fixture contract、A-C2 schema/exact-test SHA、
  API-only `/users/me` projection SHA、上述 bootstrap SHA、PR #192 现有 domain
  runtime 和测试环境，
  页面前即可输出 A-base profile/checksum、provision evidence 与 fixture handoff SHA。
- `A-route-evidence` 输入上述 fixture handoff SHA，以及后续页面/menu/API final
  handoff，输出 technical gate verdict、traceability coverage、evidence bundle 和
  cleanup verdict。

整个任务从 bootstrap 提取与独立 review 开始，A-base implementation 不得提前；
页面冻结仍不是 A-base 前置。任何 B schema 探测都必须是“确认未依赖”，不能变成 A
的必需能力。

## 2. Artifact Contract

可提交 runner/profile/schema 源码放在 `scripts/e2e/property-remediation/`：

```text
profiles/a-base-v1.*
roles/a-exact-set.*
traceability/a-requirements.*
bootstrap/**
```

运行产物唯一放在已 ignored 路径，不提交：

```text
artifacts/property-remediation/runs/<run-id>/summary.json
artifacts/property-remediation/runs/<run-id>/evidence.json
artifacts/property-remediation/runs/<run-id>/cleanup-manifest.jsonl
artifacts/property-remediation/runs/<run-id>/artifacts/**
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

Exact row contract：

```text
park=3, building=3, floor=3, unit=100, party=4000
booking=10000, booking_night=20000
lease=2000, housing_receivable=10000, charge_plan=2000
turnover=2000, handover=1000
purchase=1000, purchase_item=2000
work_order=1000, property_occupancy=6500, sys_file=2000
```

每 park 恰好 1 building/1 floor；100 unit 与可分配业务量按 60/30/10。
`property_occupancy=100×65=6500`，按 park 为 3900/1950/650。`sys_file=2000`
全部关联小型有效测试 PNG。

敏感明文不进入 checksum 或日志。运行开始校验目标租户带有专用测试标记且环境 denylist 不包含 shared/staging/production；任一判断不确定即 fail closed。

PostgreSQL fallback container 只能按 exact run-id、双 label 与 running 状态定位；
使用 `docker run --rm`、official PostgreSQL image、显式 `POSTGRES_DB` 和匿名 volume，
拒绝数据库 URL override。权限 grant/assignment 与 role tenant 必须一致，cross-scope
组合 fail closed。

Bootstrap 以 `000001`–`000174` 为 schema/data baseline，必须生成结构化
`skip-record:000175`（原因：生产数据补丁，空库 fail-fast，且不创建后续所需
schema），再执行 `000176`–`000183`。它不是 A-C2 一次性 shell 的复制，而是
可由 A0 独立调用、可复验的 harness。

## 4. Exact-set Oracle

每个角色使用相同管线采集实际集合：

```text
DB assignment -> /users/me -> active enabled_modules + granular pages + current tenant/park relation
menu materialization -> visible routes
direct route -> page guard
HTTP endpoint -> module + permission + data/field/file projection
```

比较器对集合排序去重后执行双向差集；报告 `missing` 与 `unexpected`。模块可用性与权限提升分别断言，尤其覆盖 superuser + disabled module。字段和附件使用权限交集，不因业务权限推导通用文件权限。
property granular permission 集合固定为 65，不是 69；custom role、legacy operations
和 wildcard 不能被 oracle 或实现自动展开为 page permission。
Support actor 的 permission set 必须逐项显式列出且默认拒绝未列能力；exception
super actor 是独立负向 fixture，不进入普通岗位/support bundle 或正向 pass 样本。

## 5. Layered Execution

整体顺序为 A-C2 schema/exact tests → API-only `/users/me` projection → shared Web
foundation/A-base-core provision → 发布 fixture handoff SHA → homestay/housing
并行实现并输出 route SHA → Web menu/landing/deep-link 与 housing tenant alias
handoff → A-route-evidence。A-route-evidence 内部运行
L0 → L1/L2/L3 → L4 → L5 → L6。前置数据或安全断言失败立即停止后续写操作，但仍进入 cleanup。每层输出独立 verdict 和 evidence IDs：

- L0 扫描共享权限常量、API 元数据、页面/菜单 manifest。
- L1/L2 使用当前测试框架覆盖纯策略和组件状态。
- L3 在真实 PostgreSQL 验证仅 Track A 约束与迁移重跑。
- L4 使用真实登录 token 和 HTTP，不用 service mock 证明授权。
- L5 使用浏览器覆盖 landing、深链、刷新、选择器、桌面/手机。
- L6 聚合 axe、viewport overflow、触控、性能、证据和清理。

在上述“homestay/housing 并行实现”阶段，首个 domain route SHA 触发一次
`A-foundation-first-route-ui` checkpoint：只为 shared foundation 补
desktop/mobile/keyboard/focus/zoom/ARIA 真实集成证据。它不改变六步顺序，也不提前
运行最终 A-route-evidence。禁止建立 preview/临时生产 route。

## 6. UX And Performance Harness

浏览器矩阵为 desktop 与 320/360/390/768px。每个关键页面记录首屏、loading、首次空、筛选空、error、forbidden、partial-data 和成功状态截图；按 WCAG 2.2 AA 检查 focus order、label/name、键盘操作、对比度、非颜色反馈和横向溢出。

性能采用固定容器资源和 PG 参数，预热后运行 5 次，报告 median/p90/p95、最差值、
样本和 trace。Candidate threshold 只用于观测，不能产生 PASS；阈值文件只有记录
owner、批准人、批准日期和变更原因后才冻结。runner 不接受命令行临时放宽。

## 7. Crash-safe Cleanup

write-ahead manifest 每条记录有 run ID、sequence、resource type、tenant/park、deterministic key、state、timestamp、attempt 和 error。写入 `planned` 后 fsync，才允许创建资源。reducer 重放最后状态；启动、正常结束和信号 handler 都把 `created|cleanup_pending|failed` 资源送入幂等清理。清理后以 DB/API 双侧 residual scan 证明 0 残留。禁止按模糊名称、日期范围或全租户批量删除。

## 8. Traceability And Evidence

traceability validator 保证每条父需求至少有一个正向和最近反向测试，且测试产生 evidence。evidence bundle 包括运行上下文、逐层 verdict、命令/exit、日志、截图/trace/axe/perf 的 hash、cleanup manifest hash 和 residual query。artifact 缺失、hash 不匹配或证据引用悬空均为失败。

## 9. Subagent Batches

实现阶段最多三个并行批次，文件所有权不重叠：

1. `a-bootstrap-owner`：独占 `bootstrap/**` 及其 tests，先交
   `A-ephemeral-db-bootstrap SHA`
   `b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`；
   不得实现 profile。
2. `a-profile-owner`：只在 bootstrap 独立 review PASS 后实现 A-base-core builder、
   checksum、fixture handoff SHA、生产保护、cleanup/reconcile。
3. 后续 `a-authz-owner` 与 `a-browser-evidence-owner` 按 route handoff 分阶段接管
   L0-L4 与 L5-L6；不得与 bootstrap/profile owner 同时写其路径。

首个 domain route owner 负责 `A-foundation-first-route-ui` 的浏览器执行和 artifact；
shared owner 负责组件问题修复与 Gate 签收；`a-browser-evidence-owner` 负责 evidence
schema/追溯。两份 routes 与 Web 接入完成后的最终 L5-L6 仍由第 3 批执行。

当前 foundation input SHA 为
`d2a015f9ba931b2024e6360570697c77b74ea3fb`；其 integration-ready Gate 已 PASS，
final UI Gate 仍等待首个 canonical route。Bootstrap immutable input 已由独立
checker 冻结为
`b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`；
RISK-A-004 已关闭。

批次合并后由独立 check agent 只读复核 profile 边界、双向差集、证据链与残留。任何 agent 不得修改其他 Track 的 task 目录。

每个单元以 checkpoint、immutable input SHA 和已完成 artifact hash 恢复。A-base-core
发布后可结束 owner；A-route-evidence 等待页面时不占用 core owner。core 不等待 route
完成，route 只消费 core handoff，页面只消费 core fixture，三者没有循环完成依赖。

## 10. Gate And Failure Policy

Gate aggregator 使用 AND 语义；skip 默认失败，只有父计划明确标记为该层“不适用”且带依据时才可接受。P0/P1 立即 stopship。失败报告必须保留已生成证据并完成清理，不能通过删日志、重跑覆盖或放宽阈值获得绿色结果。
