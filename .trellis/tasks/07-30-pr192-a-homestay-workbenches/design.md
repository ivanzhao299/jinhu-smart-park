# PR192 A 民宿岗位工作台技术设计

## 1. 边界与依赖

独占实现范围：

```text
apps/web/app/homestay/**
apps/web/features/homestay/**
上述路径内的民宿 Web tests
```

本任务不得修改 `packages/shared/**`、`apps/web/lib/menu.ts`、
`apps/api/**`、`database/**`、共享 property Web 组件或其他 task 目录。

输入 handoff：

1. `shared-contract-owner` 提供 route/page permission contract SHA、response/access
   manifest 和权限常量。
2. Track A 子任务 `07-30-pr192-a-shared-web-foundation` 的
   `shared-property-web-owner` 提供远程 picker、详情/对话框 shell、任务展示、
   Design System 和 permission adapters 的 integration-ready SHA。该 SHA 的
   handoff Gate 是静态/单测与 lint/typecheck/build，不含虚构 preview route。
   当前消费 SHA 为 `d2a015f9ba931b2024e6360570697c77b74ea3fb`。
3. `schema-migration-owner` 提供 Track A permission/schema SHA。
4. `menu-projection-owner` 提供 API-only `A-api-menu-projection SHA`；该输入尚不允许
   Web 暴露 property route。
5. `qa-automation-owner` 已冻结 A-base-core fixture
   `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
   profile `68da…107b`，source commit
   `32ccc02852c3201c6f68e3b6b89e4398cb102a17`；该 PASS 不等于 Track A technical
   pass。
6. `A-2.5-contract-closure SHA`：shared 全量 response types、homestay
   tasks/stays/turnover detail/finance 与 guest/work-order decisions。

`07-30-pr192-a-shared-web-foundation` 属于 A0/A1，必须先于本工作台进入实现；它不
依赖 Track B identity。上述合同需变更时提交 change request，由原 owner修改并发布
新 SHA；本任务不得复制或局部修补权威合同。

Menu、legacy `/homestay` landing 和 redirect 不是本任务启动前置，也不由 A1 实现。
本任务完成 canonical routes 与 guards 后输出 `homestay-route-landing-input SHA`，包含 route
存在性、page permission、固定 priority、module/scope/403 语义和 legacy alias；后置
A2 `menu-projection-owner` 消费该 SHA 实现 menu/landing/redirect。

该段是实施前依赖设计；当前 A-2.5 独立 Gate 已通过，Homestay Web 已交付。
`/homestay/stays/[stayId]` 只通过服务端授权 relation 解析到
booking detail，使全局 detail route 6→7。列表/详情使用批量 projection，禁止 N+1；
财务字段和附件 ID 最小投影，GET 只用精确 read permission。

若民宿先输出 Track A 首个 canonical domain route SHA，homestay Web owner 拥有该
真实 route 上的 desktop/mobile/keyboard/focus/zoom/ARIA 执行与 artifact；shared
owner 拥有组件修复和 final UI Gate 签收，QA owner 拥有 evidence 追溯。证据补齐前
不得宣称 shared foundation final UI Gate PASS。

## 2. Feature 结构

```text
apps/web/features/homestay/
  contracts.ts
  api.ts
  permissions.ts
  queries/**
  mutations/**
  components/**
  state/**
```

- `contracts.ts` 只 re-export 或组合 shared response types；表单本地类型可留在 Web。
- `api.ts` 只使用 `apiRequest`/`apiFormRequest`，不创建第二套 fetch wrapper。
- retryable mutation 使用与 API action 一致的稳定 idempotency key。
- query key 必须包含 tenant、park、route filter 和实体 ID；权限/上下文变化时失效。
- permission adapter 从 manifest 得到 page/action/field/file capability，不以 Persona
  或单个万能 permission 推断能力。
- 页面 `page.tsx` 保持薄层；业务状态与 API 调用不得复制到 route client。

## 3. 原子迁移单元

按以下顺序逐个迁移：

1. dashboard/availability query。
2. rates。
3. booking list/create/lifecycle。
4. booking detail、guest/stay/credential。
5. turnover list/detail。
6. finance projection。
7. tasks projection 与 deep-link。

每个单元：

```text
characterization
→ shared response type
→ feature API
→ query/mutation
→ existing UI block
→ legacy page consumes feature
→ delete original block
→ behavior-equivalence gate
→ canonical route
```

同一单元未通过时不得开始下一单元。禁止 dual fetch、dual mutation 或为了比较而在
生产路径双读。

## 4. 页面与数据流

```text
canonical route
  → module + page guard
  → feature query
  → API module/action/data-scope enforcement
  → permission-aware response projection
  → DS page/list/detail components
```

Dashboard 只请求 KPI/异常所需数据。Availability、rates、bookings、turnovers 和
finance 分别维护独立 query context；mutation 只 invalidate 能被该动作改变的
projection。详情身份不依赖当前列表页是否仍包含该记录。

订单和周转详情以 route param 为权威。列表 query、page、sort 和 scroll anchor
进入 URL/return context。403 与 404 不透露对象是否存在于其他 scope。

## 5. 状态模型

共享页面状态 reducer 显式覆盖：

```text
initializing
ready
empty_initial | empty_filtered | empty_scope
partial_forbidden | full_forbidden
refresh_failed | offline_stale | conflict
submitting | succeeded
```

上传另有 queued/uploading/scanning/succeeded/failed/removing 子状态。刷新失败保留
最后成功数据；只有实体切换或成功空响应才能清空。表单 readiness 绑定实体 ID 和
version；同步 in-flight guard 与稳定 retry key 防同 tick 双击。

危险确认展示订单/房源/日期/金额/影响和原因，默认焦点在取消，支持 focus trap、
Escape 和触发器焦点恢复。成功后聚焦结果标题并用 aria-live 宣布。

## 6. 响应式与 Design System

- 一个 canonical component tree 同时服务桌面和手机。
- 桌面表格与移动记录卡字段等价；移动卡提供单一明确主动作。
- 房态/任务/详情优先适配 360/390，避免固定宽度和页面级横向滚动。
- 共享上传组件负责 MIME/大小文案和预览；领域 permission 与 `file:read/upload/
  download` 分别控制 metadata、上传和 blob 请求。
- 本地 CSS 变更必须附差异清单和 computed-style/静态 DS surface 证据。

## 7. Track B/C 交接

输出给 Track B：

- canonical route 与组件 SHA。
- 高风险 read-only slot/action mapping。
- identity/approval/task 接入点。
- 当前 protected biz types 和文件上下文。

输出给 Track A A2：

- `homestay-route-landing-input SHA`。
- canonical route/page permission/priority/legacy alias 清单。
- 页面直达与 403/empty-scope 的验证结果。

Track B 只能在 handoff 后把 read-only slot 接到 approval/identity command，不得
复制页面。输出给 Track C 的 handoff 记录超限文件、现有性能基线和弱网草稿接入点。
任一 open P0/P1 时禁止交接。

## 8. Machine Gates

- Contract gate：共享 response type 无重复；route/page/action 映射唯一。
- Extract gate：旧 block 删除；没有 dual request/mutation owner。
- Permission gate：module/page/action/data/field/file 正负组合。
- State gate：每 route 状态矩阵 100%，未授权 block 请求数为 0。
- Navigation gate：deep-link、刷新、back/forward、returnTo allowlist 和 scroll。
- Mobile gate：360/390/768/desktop、横竖屏、软键盘、无水平溢出。
- Accessibility gate：axe、键盘、NVDA/等价读屏、zoom/reflow、forced colors、
  reduced motion、focus 和 44px。
- Complexity gate：新 route client ≤450 行、新普通组件 ≤300 行、新函数 ≤80 行且
  cyclomatic complexity ≤15；现有超限文件不得增长。

例外必须有 owner、理由、补偿测试和 expiry；权限、敏感字段、附件、幂等与数据隔离
不可豁免。

## 9. 2026-07-31 最终设计实现状态

`44d6769` 与 `bc2ed7f` 已实现本设计，shared/RBAC/integration 消费链无漂移。
独立多轮 Gate、最终 API full unit 91/91、Web default `tsc`/lint/build 154 均通过，
`open_P0_P1=[]`。

仍缺真实 browser artifact：Chrome connector 无法在仓库 `sandboxCwd` 中运行，
故 desktop/390、keyboard、zoom/reflow 未实测。此项不推翻机器 Gate，但阻止
release-ready 结论。
