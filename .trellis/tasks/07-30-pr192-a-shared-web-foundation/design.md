# PR192 A 共享 Web 基础技术设计

## 1. Ownership

独占范围：

```text
apps/web/features/property-shared/**
该路径内的 shared Web component tests
```

不得修改：

- `packages/shared/**`、`apps/web/lib/menu.ts`、`apps/api/**`、`database/**`。
- `apps/web/app/homestay/**`、`apps/web/features/homestay/**`。
- `apps/web/app/housing/**`、`apps/web/features/housing/**`。
- `apps/web/app/assets/parties/**` 或 Track B 控制面 routes。
- property approval、task runtime 或 identity 内部路径。

如必须修改现有全局 DS/文件组件，先向其当前 owner 提交 change request；不得顺手扩大
本任务 ownership。

本任务只在 A-schema SHA 与 API-only `A-api-menu-projection SHA` 冻结后启动。
它不得创建 domain app route/guard、修改 Web menu 或把未落地 route 注册为可见入口；
这些分别由 homestay/housing Web owners 与后置 Web 接入批次持有。

Shared component props 可使用业务中立 view model，但不得替代 `packages/shared`
response contract。所有 workbench 现有/新增 response types 由后置 A-2.5
shared-contract owner 冻结；领域 route consumer 必须等待
`A-2.5-contract-closure SHA`，禁止 route-local interface、N+1 adapter 或扩 bundle。

## 2. 模块结构

```text
apps/web/features/property-shared/
  access/
    capability-adapter.ts
  picker/
    RemoteEntityPicker.tsx
    types.ts
  detail/
    CanonicalDetailShell.tsx
    return-context.ts
  dialog/
    ConsequenceDialog.tsx
  tasks/
    TaskPresentation.tsx
    task-filter-query.ts
  states/
    PageState.tsx
    LiveRegion.tsx
  ds/
    PropertyPageSurfaces.tsx
```

组件 API 通过 props 描述业务身份、字段和 callbacks；不得 import homestay/housing/
identity/approval API。网络访问仅允许 picker 的注入式 loader 或业务中立 endpoint
adapter，领域 query/mutation 留给工作台。

## 3. 状态和权限

Capability adapter 输出显式 booleans/projections：

```text
moduleAvailable
pageAllowed
actionAllowed(actionId)
fieldProjection(field)
fileCapability(bizType)
dataDimensions
```

它不决定服务端权限，也不把 wildcard 解释为 module bypass。权限、tenant、park 或
scope epoch 变化时，picker/detail 调用方可通过统一 invalidation key 清除缓存和
selection。

PageState 使用穷举 union，区分 empty-initial/filtered/scope、full/partial forbidden、
refresh-failed、offline-stale 和 409。不得把三类空态渲染为同一文案。

## 4. Detail 与返回上下文

Detail shell：

- route entity ID 是身份权威。
- drawer 仅是桌面呈现；直接刷新渲染完整页。
- `returnTo` 解析器只接受 manifest/调用方 allowlist。
- filter/page/sort/scroll anchor 结构化序列化。
- 403/404 不泄露 scope 外实体存在性。
- 成功聚焦结果标题，失败保留最后成功内容。

## 5. Picker 与任务展示

Picker：

- 2 字符、300ms debounce、AbortController、服务端分页。
- 选中 label snapshot 来自服务端投影。
- loading/no-result/no-permission/failure/invalid-context 分离。
- ARIA combobox/listbox、键盘和触摸。
- create CTA 仅通过注入的独立 create capability 显示。

Task presentation：

- filter/count/list 均由调用方提供同一 predicate 的服务端结果。
- 只显示 claim/start/block 等授权轻动作 callbacks 和 canonical deep-link。
- 不持有 completed 状态，不合并 stale projection 为第二权威。
- 浏览器前进/后退恢复 query，tenant/park 变化清除旧 count/selection。

## 6. Dialog 与 Design System

ConsequenceDialog 强制 `title`、target identity、consequences、reason policy 和 action
label。打开聚焦标题，默认焦点取消，trap/Escape/restore 完整。高风险调用方不能仅
传“确定”或省略影响。

DS adapters 只组合既有 surface/token。Page-local exceptions 由领域工作台拥有，本
任务不新增一套全局 CSS。桌面/移动字段 schema 单源生成表格单元与记录卡内容。

## 7. Machine Gates

- Import boundary：无 Track B 或领域 API import。
- Contract：只消费 frozen A manifest/response types，无重复 permission/response。
- Component：状态 union 穷举、picker/dialog/detail/task 行为测试。
- Effects：未授权 optional component 不调用 loader/callback。
- Navigation：allowlist、refresh、back/forward、scroll。
- Foundation handoff accessibility：ARIA/state/focus contracts 的静态检查与组件
  单测。
- Foundation final UI Gate：首个真实 domain canonical route SHA 上执行 axe、
  keyboard、focus、zoom/reflow、ARIA、forced-colors 与读屏等价检查。
- Responsive/DS：handoff 阶段只需 static surface evidence；320/360/390/768/
  desktop computed/runtime evidence 延后到上述真实 route。
- Complexity：组件 ≤300 行、函数 ≤80 行、cyclomatic complexity ≤15。

不得为 shared foundation 创建 preview route 或临时生产 route。首个交付 canonical
route SHA 的 homestay/housing owner 拥有浏览器执行与 artifact 采集，shared owner
拥有组件问题修复和 final UI Gate 签收，QA owner 维护 evidence 追溯。

Integration-ready baseline：
`d2a015f9ba931b2024e6360570697c77b74ea3fb`。它已通过三路 S2 final review
（14 specs、boundary 5/5、ESLint、workspace typecheck、shared/Web build，
`open_P0_P1=[]`），但不携带首个真实 route 的浏览器证据。

## 8. 2026-07-31 集成状态

`bc2ed7f` 与 `992a6a4` 已在真实 canonical routes 消费 foundation，默认 Web build
输出 154 routes 并通过。代码与机器 Gate 无 open P0/P1。Chrome connector 因
`sandboxCwd` 无法执行浏览器会话，因此 desktop/390、keyboard、focus、zoom/reflow
artifact 仍待补采；这是一项基础设施阻塞，不应伪报为已验证。
