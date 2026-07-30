# PR192 A 住房岗位工作台技术设计

## 1. 所有权和输入

独占范围：

```text
apps/web/app/housing/**
apps/web/features/housing/**
上述路径内的住房 Web tests
```

禁止修改 `packages/shared/**`、`apps/web/lib/menu.ts`、`apps/api/**`、
`database/**`、共享 property Web 路径和其他 task 目录。

依赖 handoff：

- route/page permission contract SHA：manifest、response contracts、permission
  constants。
- Track A permission/schema SHA。
- API-only `A-api-menu-projection SHA`；该输入尚不允许 Web 暴露 property route。
- Track A 子任务 `07-30-pr192-a-shared-web-foundation` 的 shared Web foundation
  integration-ready SHA：picker、detail/dialog、task presentation、DS surface 和
  permission adapters；handoff Gate 是静态/单测与 lint/typecheck/build，不含
  preview route。当前消费 SHA 为
  `d2a015f9ba931b2024e6360570697c77b74ea3fb`。
- 已冻结的 A-base-core fixture
  `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`、
  profile `68da…107b` 与 source commit
  `32ccc02852c3201c6f68e3b6b89e4398cb102a17`；该 PASS 不等于 Track A technical
  pass。
- `A-2.5-contract-closure SHA`：shared 全量 response types、housing
  tasks/handover list+detail/billing/finance/repair list+detail，以及 Party target
  decision。

该 shared Web 子任务属于 A0/A1，先于住房工作台 handoff，且不依赖 Track B
identity。附件复用仓库既有共享上传组件；离线 draft/upload queue 仍属于 Track C，
不得被解释为本前置 SHA。任何契约变更由对应 owner 处理；住房页面不得本地复制。

Menu、legacy `/housing` landing 和 redirect 不是本任务启动前置，也不由初始 route
批次实现。
本任务完成 canonical routes 后输出 `housing-route-landing-input SHA`，包含 route
存在性、page permission、固定 priority、module/scope/403 语义和 Party alias
contract；后置 A2 中，`menu-projection-owner` 消费该 SHA 实现 menu/landing 与
unknown deep-link fail-closed，`housing-web-owner` 仍独占 app route 并实现 Party
canonical alias redirect/guard。alias 是后置 Web 接入产物，不是 route SHA 的虚假
前置；menu owner 不得接管 housing route。

Party canonical target 与独立页面权限已交付，housing alias 只指向
`/assets/parties/[partyId]`。A-2.5 独立 Gate 已通过，Housing Web 已交付。列表/详情
使用批量 projection，禁止 N+1；财务字段/附件 ID 最小投影，
GET 只用精确 read permission。Move-out financial completion 是第 9 个 high-risk
variant，Track B 前仍 unavailable。

若住房先输出 Track A 首个 canonical domain route SHA，housing Web owner 拥有该
真实 route 上的 desktop/mobile/keyboard/focus/zoom/ARIA 执行与 artifact；shared
owner 拥有组件修复和 final UI Gate 签收，QA owner 拥有 evidence 追溯。证据补齐前
不得宣称 shared foundation final UI Gate PASS。

## 2. Feature 分层

```text
apps/web/features/housing/
  contracts.ts
  api.ts
  permissions.ts
  queries/**
  mutations/**
  components/**
  state/**
```

- shared response types 只 import/re-export；表单 view model 可本地声明。
- JSON/FormData 分别使用 `apiRequest`/`apiFormRequest`。
- query key 包含 tenant/park/filter/entity/version；上下文变化立即取消旧请求。
- mutation 使用同步 in-flight guard 和稳定 idempotency key，成功只刷新受影响投影。
- permission adapter 消费 manifest capability，不根据 Persona、页面或万能 permission
  推断 action。

## 3. Extract 顺序

1. dashboard query。
2. tenant/Party list；canonical redirect 留到 route SHA 后的 Web 接入批次。
3. lease list/create/detail。
4. billing。
5. finance/deposit。
6. handover/repair。
7. purchase。
8. tasks projection。

每个闭包先在 legacy route 复用并删除旧 block，再建 canonical route。涉及同一巨型
客户端时串行 handoff，禁止多 worker 并发编辑。

## 4. Canonical 数据流

```text
route module/page guard
 → feature query/mutation
 → API permission + scope + state guard
 → authorized field/file projection
 → DS list/detail/form
```

租约 detail 是人员、费用、交割和审批上下文的组合投影，但各 query 独立按权限启用；
无权 block 不请求。住房 finance 只读取/写入 housing 子账。Repair 指向 owning work
order，Party 指向 asset canonical detail；Web 不复制其业务状态。

列表 query 写入 URL。详情 route param 是实体身份权威；分页或排序变化不会让已选
详情错误指向另一对象。列表最后一项删除/离队后 clamp page 并重新取数。

## 5. 表单和证据

- 租约日期强制 `start < end`；周期、账单日、租金、押金和读数同时满足浏览器与 API
  约束。
- 金额以 decimal string/scaled integer 贯穿，不在 UI 中使用浮点中间计算。
- 每个 picker 独立持有 candidate pagination/selection；服务端返回授权 label。
- 上传期间锁提交、删除和切换上下文。既有 bizId 附件刷新后从 authoritative
  association 恢复；pre-object 票据从当前 actor pending list 恢复。
- 领域读/写权限与通用 file read/upload/download 分离；没有 download 不取 blob。

## 6. 状态、危险动作和可访问性

页面状态使用显式 reducer，区分刷新错误与 action feedback，保留最后成功数据。
read-only 高风险 slot 显示对象、金额、状态、所需审批能力和不可执行原因；不得挂载
mutable form 或发 mutation。

可执行破坏动作确认重复租约/采购/房源等不可变身份，说明后状态和依赖影响，原因
必填，默认焦点取消并恢复触发器。成功聚焦结果标题并宣布。

响应式、DS 和 WCAG 要求与父任务一致；桌面表格和移动卡不得丢失金额、状态、到期
日、对象身份或主动作。

## 7. Track B/C Handoff

Track B 接收：

- canonical detail/tab 和 read-only approval slot。
- Party redirect 与 identity capability 接入点。
- finance/purchase/lease 高风险 action mapping。
- protected file biz type 与 scope 组合。

Track A A2 接收：

- `housing-route-landing-input SHA`。
- canonical route/page permission/priority/legacy alias 清单。
- 页面直达、403/empty-scope 验证结果。
- 后置 A2 仅在 Party target handoff 后由 housing owner 另交 canonical alias
  redirect/guard SHA；否则提供 link/redirect=0 evidence。

Track C 接收超限文件、query/request 性能基线、draft/upload 队列接入点。Handoff
记录 base/handoff SHA、路径、命令、已知失败；open P0/P1 时禁止交接。

## 8. Machine Gates

- Response/manifest contract 无本地分叉。
- Legacy/new route 无 dual mutation、dual state owner。
- page/action/data/field/file/module 权限格完整。
- Housing 子账边界、decimal round-trip 和幂等测试通过。
- 状态矩阵、deep-link/return context、picker/file 恢复通过。
- 高风险 UI 请求数为 0，API 负向用例 fail closed。
- 360/390/768/desktop、WCAG 2.2 AA、DS surface 证据通过。
- 新 route client ≤450 行、普通组件 ≤300 行、函数 ≤80 行、复杂度 ≤15；现有超限
  文件不增长。例外不得覆盖财务、权限、数据隔离、附件或并发 Gate。

## 8. 2026-07-31 最终设计实现状态

`8a0bd17` 与 `992a6a4` 已实现本设计；最终 API full unit 91/91、Web default
`tsc`/lint/build 154、独立 Gate 与 DB evidence 通过，`open_P0_P1=[]`。唯一缺口为
Chrome connector `sandboxCwd` 阻止真实 desktop/390、keyboard、zoom/reflow 验证。
