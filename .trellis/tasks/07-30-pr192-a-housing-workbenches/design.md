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
- Track A 子任务 `07-30-pr192-a-shared-web-foundation` 的 shared Web foundation
  SHA：picker、detail/dialog、task presentation、DS surface 和 permission adapters。
- 早期 A-base-core fixture/profile checksum。

该 shared Web 子任务属于 A0/A1，先于住房工作台 handoff，且不依赖 Track B
identity。附件复用仓库既有共享上传组件；离线 draft/upload queue 仍属于 Track C，
不得被解释为本前置 SHA。任何契约变更由对应 owner 处理；住房页面不得本地复制。

Menu、legacy `/housing` landing 和 redirect 不是本任务启动前置，也不由 A1 实现。
本任务完成 canonical routes 后输出 `housing-route-landing-input SHA`，包含 route
存在性、page permission、固定 priority、module/scope/403 语义和 legacy alias；后置
A2 `menu-projection-owner` 消费该 SHA 实现 menu/landing/redirect。住房 Party
canonical alias 属住房 route contract，不能被解释为 A2 的前置产物。

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
2. tenant/Party list 与 canonical redirect。
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
- 页面直达、Party canonical alias、403/empty-scope 验证结果。

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
