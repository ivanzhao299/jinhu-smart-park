# PR192 A 自动化门禁

## Goal

为父任务 Track A 建立可重复、可审计、默认拒绝的技术门禁，证明拆分后的共享房产底座、民宿、住房出租页面能够按模块、页面、API、数据范围、字段和文件六层精确隔离。门禁只依赖 PR #192 已有 schema 与 Track A 交付，不以 Track B 新表或新语义作为通过条件。

## Scope

- 先行交付 `A-ephemeral-db-bootstrap`：把 A-C2 临时 DB 做法提取为可独立复验、
  仅允许 exact ephemeral container 的 bootstrap harness；独立复审通过前不启动
  A-base implementation。
- 先行交付 `A-base-core provision`：固化 `property-remediation-a-base-v1` 数据画像、
  版本、checksum 与 fixture handoff SHA，供 homestay/housing 合同研究及 A-2.5
  通过后的页面实现使用。
- A-base handoff 后执行 `A-2.5-contract-closure`，在任何 workbench Web 前验证
  shared/API response、GET permission、field/file projection、detail alias、
  high-risk variant 与 Party target decision。
- 页面/menu/API handoff 后交付 `A-route-evidence`：运行路由、权限、浏览器、UX 与最终证据门禁。
- 在首个 domain route SHA 产生时先登记 `A-foundation-first-route-ui` evidence，
  专门关闭 shared foundation 延后的 desktop/mobile/keyboard/focus/zoom/ARIA Gate；
  它不替代两份 routes 和 Web 接入后的最终 `A-route-evidence`。
- 建立精确岗位用户、模块、菜单、路由、API、数据范围、字段和文件能力夹具。
- 覆盖正向可达性、最近的反向能力、跨园区/跨租户、超管但模块停用、深链与旧入口。
- 建立需求追溯、运行证据、写前清理清单、异常恢复和残留扫描。
- 对 Track A 适用的 L0-L6 层执行自动化，并验证桌面、320/360/390/768px、可访问性和稳定性能基线。

## Out of Scope

- Identity submission/snapshot、approval、assignment、outbox/inbox/DLQ 等 Track B schema 与业务行为。
- 真人岗位代表 UAT、业务/财务/安全签署和生产发布批准。
- 以宽角色、`*`、superuser 或 legacy operations 权限替代精确岗位授权。

## Fixture Delivery Lanes

### A-base-core provision

该阶段在 A-C2 schema/exact tests、API-only `/users/me` projection 与
`A-ephemeral-db-bootstrap SHA` 冻结后启动，
只依赖 fixture contract、Track A 可用 schema、API projection contract 和 PR #192
现有 domain runtime；不依赖页面或 Web menu 最终 handoff。它必须在页面开发前可运行，
输出：

- `property-remediation-a-base-v1` profile/version/checksum；
- generator/schema/contract SHA；
- 可复验的 fixture handoff SHA；
- provision evidence、write-ahead cleanup manifest 与 residual=0 证明。

homestay/housing owner 可只依赖此不可变 fixture handoff SHA 开始合同消费研究，但
页面与领域 Web 验证还必须等待 `A-2.5-contract-closure SHA`。
Shared foundation 不为浏览器验收创建 preview/生产 route；其 integration-ready
handoff 只要求静态/单测和 lint/typecheck/build。首个 domain route owner 在真实
route 上补 UI evidence，shared owner 签收，QA 追溯。
当前 handoff SHA 为
`3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
来自 source commit `32ccc02852c3201c6f68e3b6b89e4398cb102a17` 和 final run
`abase20260730final32ccc01`；profile checksum 为 `68da…107b`。Shared Web
integration-ready SHA 仍为
`d2a015f9ba931b2024e6360570697c77b74ea3fb`，final UI Gate 仍
`awaiting_first_canonical_route`。

### A-route-evidence

该阶段等待两份 canonical route SHA、Web menu/landing/deep-link handoff、Party
target decision（target 已交付时还需 housing alias handoff）与 API projection SHA
后，消费 A-base-core 的 fixture handoff SHA，
执行 exact-set、L0-L6 中适用层、浏览器/UX/perf、traceability 和最终 cleanup/evidence
技术门禁。

A-base-core、A-2.5 和 A-route-evidence 三个阶段允许独立暂停和恢复。
A-base-core 完成不等待后两者；A-2.5 必须在 core handoff 后串行 Gate，失败时只阻止
页面启动，不反向撤销 core fixture。A-route-evidence 失败或等待页面也不会反向撤销
已发布的 core fixture 或已通过的 contract closure，因而不存在相互完成依赖或循环等待。

## Requirements

### A1. 独立 A-base 画像

`property-remediation-a-base-v1` 必须确定性生成以下 exact rows：

```text
park=3
building=3
floor=3
unit=100
party=4000
booking=10000
booking_night=20000
lease=2000
housing_receivable=10000
charge_plan=2000
turnover=2000
handover=1000
purchase=1000
purchase_item=2000
work_order=1000
property_occupancy=6500
sys_file=2000
```

`property_occupancy=6500` 的公式是 100 unit × 每 unit 65 条，park 分布
3900/1950/650。每个 park 恰好 1 building、1 floor；unit 与所有可分配业务量保持
60/30/10。2,000 个 `sys_file` 均关联小型有效测试 PNG。它必须：

- 只依赖 Track A 与 PR #192 已有 schema；
- 不创建 Track B 表记录；
- 固化 profile version、seed、business clock、行数、主键生成规则、数据 manifest 与 checksum；
- 重复创建得到相同 checksum，变化必须显式升级 profile version；
- 使用专用测试租户/园区和可识别的 deterministic key，不接触共享、预发或生产数据。

### A2. Exact-set 权限夹具

每个岗位夹具必须声明：

```text
expected.modules
expected.permissions
expected.menu_routes
expected.data_scopes
```

运行时分别采集 `/users/me`、菜单树、路由守卫、API 授权和数据投影，断言 `actual == expected`，不能只断言包含。夹具必须显式禁止 `*`、superuser、旧 `homestay:operations:*` / `housing:operations:*` 等宽权限。每个受保护动作至少覆盖允许角色、最近禁止角色、跨园区、跨租户、模块停用和直接深链。

property granular permission oracle 必须恰好为 65 项，不是 69；custom role、legacy
operations 与 wildcard 不得自动扩展为 granular page permission。

Support actor 使用显式、最小化 `expected.permissions`，不得用 `*`、superuser 或
legacy operations 代替；未明确列出的写、财务、敏感字段和文件下载能力均为禁止。
Exception super actor 是单独的负向测试主体，只用于 module disabled、跨 scope 与
fail-closed 场景，不计入普通岗位/support bundle，也不作为正常放行依据。

### A2.5. Workbench Contract Closure Gate

必须验证：

- shared 中存在所有现有/新增 response types；
- homestay tasks/stays/turnover detail/finance 与 guest/work-order candidates；
- housing tasks/handover list+detail/billing/finance/repair list+detail；
- `/homestay/stays/[stayId]` 使 detail routes 6→7，且只做 authorized alias；
- move-out financial completion 为第 9 个 high-risk variant，Track B 前 409/
  unavailable；
- financial fields/file IDs 最小投影，GET 精确 read permission；
- 无 N+1、route-local interface 或 bundle expansion；
- Party canonical target、独立页面权限与 housing alias 必须有精确 handoff evidence。

Gate owners 为 shared-contract、homestay-api、housing-api、schema-migration、
asset-party decision 与独立 checker。合同研究可以先行；A-base handoff 和本 Gate
PASS 前 Web workbench 不得开始。

### A3. 需求追溯

追溯记录至少包含 `requirement_id`、来源类型/路径/行号、用户旅程、route/page/API/module/data/field/file、正反测试 ID、evidence ID、owner、status，以及有时限的 variance/waiver。下列契约不可豁免：

- tenant/park/data-scope 隔离；
- 敏感字段与受保护文件；
- 财务精度与财务字段最小投影；
- 幂等、并发和 maker-checker；
- forward-only migration；
- 测试夹具生产保护；
- shared occupancy。

追溯缺项或存在过期 waiver 时门禁失败。

### A4. 适用的 L0-L6

- L0 静态：IA/permission manifest、共享常量、API decorator、页面 guard、菜单和 route 映射一致；一页一权限，不允许孤儿或复用宽码。
- L1 单元：模块/权限/数据范围策略、business date、金额/日期边界、菜单过滤和 route fallback。
- L2 组件：按精确权限挂载完整表单、子控件、文件元数据/下载交集、loading/empty/error/forbidden 状态。
- L3 schema：仅验证 Track A 已部署的菜单/权限/既有业务约束和迁移幂等；不得探测或要求 Track B schema。
- L4 HTTP：真实 API 的 module/permission/data/field/file 正反矩阵及 400/403/404/409 契约。
- L5 浏览器：菜单、landing、深链、刷新、分页、选择器、桌面与手机卡片路径。
- L6 非功能：WCAG 2.2 AA 核心项、无横向溢出、触控目标、可复现性能、证据完整性和零残留。

源代码字符串断言只能补充，不能替代行为测试。

### A5. UX 与性能

所有新入口必须有明确 landing，并覆盖 loading、首次空、筛选空、error、forbidden、partial-data 与成功状态；用户不得手填 UUID 才能完成主流程。附件使用共享上传/预览组件与共享策略。桌面表格和移动卡片必须在同一断点切换。

性能运行必须记录 commit、Node/pnpm、CPU/内存限额、PostgreSQL 版本/参数、浏览器版本、A-base checksum、business clock、warm-up、并发和 5 次样本。阈值在首次批准基线中冻结；未获产品/技术负责人批准不得通过修改阈值掩盖回归。

### A6. Evidence 与 Cleanup

每次运行输出机器可读 summary 和人可读报告，包含 commit、环境、profile/checksum、命令、开始/结束时间、退出码、失败日志、测试/截图/trace/axe/perf artifact 路径与 SHA-256。
运行 artifact 唯一写入已 ignored 的
`artifacts/property-remediation/runs/<run-id>/**`；`scripts/**` 只保存 runner、
profile/schema 和可提交测试源码，禁止提交 `runs/**`。

任何创建数据前必须先向 append-only JSONL write-ahead manifest 写入并持久化 `planned`，随后记录 `creating -> created -> cleanup_pending -> cleaned|failed`。SIGINT/SIGTERM、runner 崩溃和下次启动均执行 reconcile。清理只按 manifest 的精确 scope/key 操作；结束时 residual scan 必须为 0，否则失败。

## Machine Gate

Track A technical pass 需要同时满足：

- A-base checksum 可重复且确认没有 B 数据；
- exact-set 全部相等，所有最近反向和跨 scope 用例通过；
- 追溯覆盖率 100%，无不可豁免缺口或过期 waiver；
- 适用 L0-L6 全绿，UX、可访问性和冻结后的性能阈值通过；
- evidence 可校验、artifact hash 匹配、cleanup residual=0；
- 没有 P0/P1 stopship。

`A-base-core provisioned` 只是可供下游消费的 fixture milestone，不等于
`track_a_technical_passed`；最终 technical pass 由 A-route-evidence 汇总产生。

## Stopship

- P0：跨租户/园区读取或写入；敏感身份或受保护文件泄漏；财务越权/金额错误；权限绕过；生产数据被夹具写入；清理误删非测试数据。
- P1：模块停用仍可菜单/深链/API 访问；exact-set 多授予；页面主流程不可达；移动关键流程不可用；证据、checksum 或残留清理不可信；不可豁免追溯缺口。

P0/P1 未关闭不得标记 `track_a_technical_passed`，不得以 waiver 放行。

## Acceptance Criteria

- [x] `property-remediation-a-base-v1` 可从空测试环境重复创建并产生相同 checksum；
  final run=`abase20260730final32ccc01`，profile=`68da…107b`，真实双 run 已覆盖。
- [x] A-base-core 在页面/menu/API handoff 前独立运行并输出 fixture handoff
  `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`
  给 homestay/housing。
- [x] A-base-core 只在 A-schema、API-only projection 与
  `A-ephemeral-db-bootstrap SHA` 冻结后启动，且不要求 Web menu 或 canonical
  routes 已完成。
- [x] `A-ephemeral-db-bootstrap` 独立 review PASS，覆盖
  `000001`–`000174` + `skip-record:000175` + `000176`–`000183`，并复用 A-C2
  ephemeral-container 安全约束；未通过时 A0 implementation 不启动。
- [x] Handoff SHA
  `b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`
  已通过独立 checker；4项P1关闭、owner 7/0/1、Linux SIGTERM 1/1、
  same-run-id 双链、关键 runtime 与 residual=0。RISK-A-004 CLOSED；随后 A0
  已 provisioned/frozen。
- [x] A-base-core 已按 checkpoint 独立完成并冻结，不等待 A-route-evidence；
  后者仍 awaiting handoff。
- [ ] `A-foundation-first-route-ui` 来自首个真实 domain route SHA，无 preview route；
  在它通过前 foundation 不标 final UI Gate 完成。
- [ ] A-2.5 在 A-base handoff 后独立 PASS，`open_P0_P1=[]`；未取得 closure SHA 时
  homestay/housing Web 变更数为 0。
- [x] A-base manifest 明确断言 Track B 表/记录不存在或为零，且不把 B schema 作为前置。
- [x] A-base exact-row contract 全部相等：3/3 building/floor、4,000 Party、
  20,000 booking_night、2,000 charge_plan、1,000 handover、2,000 purchase_item、
  1,000 work_order、6,500 property_occupancy、2,000 sys_file，以及原有
  3 park/100 unit/10,000 booking/2,000 lease/10,000 receivable/2,000 turnover/
  1,000 purchase 与 60/30/10。
- [ ] Support 是显式最小权限正向 actor；exception super actor 是隔离负向 actor；
  2,000 sys_file 均为小型有效测试 PNG。
- [ ] 每个岗位 `actual == expected`，无 wildcard/super/legacy 宽权限。
- [ ] property permission exact set 恰好 65，任何 69 项或隐式 granular 扩权均失败。
- [x] A-C2 fixture fallback exact run-id/双 label/running、`--rm`、official
  PostgreSQL、显式 `POSTGRES_DB`、匿名卷、拒绝 URL override 与 cross-scope
  permission/role tenant 一致性通过，`open_P0_P1=[]`。
- [ ] 模块停用超管、跨租户、跨园区、最近禁止角色、深链和旧入口均默认拒绝。
- [ ] requirement-to-test-to-evidence 追溯覆盖率 100%。
- [ ] 适用 L0-L6、桌面与 320/360/390/768px、WCAG 2.2 AA 和性能基线全部通过。
- [ ] Candidate 性能阈值仅产生观测结果；只有带 owner、批准人和日期的阈值冻结后
  才能形成 performance PASS，candidate 不得使 Gate 变绿。
- [ ] 所有 run artifacts 位于 ignored
  `artifacts/property-remediation/runs/**`，`scripts/**` 无已生成 runs。
- [ ] 中断恢复后 cleanup residual=0，证据 schema 和 artifact hash 校验通过。
- [ ] 运行报告明确列出命令、结果、跳过项、原因和剩余风险。

## 8. 2026-07-31 当前 Gate 结论

A-2.5 最终 API full unit 为 91/91；此前 92 的口径包含后来撤销的临时
assets-unit-picker spec，不作为最终数字。Web default `tsc`/lint/build 154、独立
多轮 Gate 与 DB evidence 均通过，`open_P0_P1=[]`。

真实 desktop/390 visual、keyboard 与 zoom/reflow 未执行，按用户决定转入外部
UAT。该项不阻塞 Track A 技术关闭，但在生产就绪签署前仍需完成，且不能用机器测试
替代真实浏览器证据。
