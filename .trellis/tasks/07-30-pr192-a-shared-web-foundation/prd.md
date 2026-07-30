# PR192 A 共享 Web 基础

## 1. 目标

在 Track A A0/A1 建立民宿与住房工作台共同消费的 Web 展示基础，避免两个领域分别
实现远程实体选择、详情容器、危险确认、任务展示、权限适配和 Design System 状态。
本任务必须先于两个工作台完成 handoff；启动输入依次为 Track A contract/server-safety
baseline、A-C2 schema/exact-test SHA 与 API-only `/users/me` property projection SHA。
它不依赖 Track B identity schema、approval runtime、task assignment 或控制面。

## 2. 范围

交付以下业务中立能力：

- 远程实体 picker：服务端搜索、debounce、取消旧请求、分页、授权 label、失效选择。
- Canonical detail shell：完整页与桌面 drawer/intercept route 可共享的布局、loading、
  forbidden、failure、conflict 和返回上下文插槽。
- Accessible dialog/confirmation shell：对象、影响、原因、默认取消、focus trap/restore。
- Task presentation：列表/卡片、筛选 chip、count、stale 状态、轻动作插槽和 deep-link；
  不持有 assignment 或业务完成状态。
- Design System 页面、列表、移动记录和状态 surface adapters。
- Manifest permission adapters：module/page/action/data/field/file capability 的纯投影，
  不把 Persona、Role 或 legacy `*:operations` 当成授权。
- 通用三类空态、局部错误、offline/stale、submitting、success 和 aria-live 表现。

## 3. 明确排除

- Party/identity 专用表单、submission/snapshot、敏感字段业务规则。
- Approval decision/execution、maker-checker、审批队列或 assignment。
- 任何 schema、migration、seed、API domain command 或菜单变更。
- 民宿/住房业务 API wrapper、query key 或 mutation。
- Track C IndexedDB 草稿、离线上传队列和后台 mutation。
- 创建第二套通用按钮、表格、颜色、shadow、border 或 upload policy。

## 4. 契约要求

- 输入是 `shared-contract-owner` 冻结的 A-contract/server-safety SHA、A-schema SHA 与
  A-api-menu-projection SHA。
- Picker 只接收服务端授权后的 `{id,label,secondaryLabel,disabledReason}`；组件不从
  手机号、证件号等原始字段拼 label。
- Permission adapter 只解释 manifest capability，不替代 API/service 判权。
- Task presentation 接收 projection 和 action callbacks，不提供 `complete()` 之类会
  成为第二状态源的本地业务 API。
- Detail/return context 只接受同源 allowlist route，filter/page/sort/scroll anchor
  使用结构化输入。
- Dialog 必须要求调用方提供稳定对象身份、动作后状态和影响；组件不生成虚假业务
  原因或默认事实。
- 文件展示复用现有 FileUploader/AttachmentList/FilePreview；本任务不复制 upload
  policy 或扩大 file permission。

## 5. UX、移动与无障碍

- 复用 `ds-page`、`ds-hero`、`ds-panel`、`ds-table-shell`、
  `ds-mobile-record-list` 等现有 surface。
- 320 CSS px reflow，360/390/768/desktop，无页面级横向滚动。
- 44×44 触控目标、软键盘和横竖屏可用。
- WCAG 2.2 AA：键盘、可见焦点、dialog trap/restore、错误关联、aria-live、
  200%/400% zoom、读屏、forced-colors、reduced-motion 和颜色对比。
- 桌面表格与移动卡使用同一字段描述，避免内容漂移。

## 6. Handoff

输出唯一 `A-shared-web-foundation SHA`，同时交给：

- `07-30-pr192-a-homestay-workbenches`
- `07-30-pr192-a-housing-workbenches`

当前 integration-ready handoff SHA：
`d2a015f9ba931b2024e6360570697c77b74ea3fb`
（`feat(property): add shared workbench foundation`）。

Foundation handoff 包含 owned paths、contract SHA、组件 API、纯函数/组件静态检查、
单测、lint/typecheck/build、已知限制和 open P0/P1。由于此阶段没有真实 domain
route，不创建 preview/生产 route 来伪造浏览器证据。两个工作台可在 handoff 后开始
消费研究，但 Web 集成必须等待 A-base handoff 后的 `A-2.5-contract-closure SHA`；
首个产出 canonical route SHA 的 domain owner 必须在真实 route 上补齐
desktop/mobile/keyboard/focus/zoom/ARIA 浏览器证据，并交由 shared owner 与 QA
共同关闭 foundation final UI Gate。

A-2.5 由 shared-contract owner 冻结所有现有/新增 response types；foundation 不授权
领域 route 声明本地 response interface。

## 7. 验收标准

- [ ] 所有共享组件业务中立，不含 identity/approval/domain 状态逻辑。
- [ ] Picker 授权 label、分页、取消旧请求、撤权失效和键盘/读屏测试通过。
- [ ] Detail shell 支持完整页/抽屉、直接刷新和 allowlist return context。
- [ ] Dialog focus、原因、不可逆影响、默认取消和触发器恢复通过。
- [ ] Task presentation 不持有业务完成状态，count/stale/deep-link 可测试。
- [ ] Permission adapter 不因 page、Persona、wildcard 推导 module/API 能力。
- [ ] 三类 empty、403、failed、offline/stale、conflict、submit/success 状态通过。
- [x] Foundation handoff 的纯函数/组件静态与单测、lint/typecheck/build 通过
  （14 specs、boundary 5/5、ESLint、workspace typecheck、shared/Web build）。
- [ ] 首个 domain route SHA 上的 desktop/mobile/keyboard/focus/zoom/ARIA 浏览器
  证据通过后，foundation final UI Gate 才完成。
- [ ] 两个工作台均只消费同一 foundation SHA。
- [ ] 本任务不创建 canonical domain route，不修改 Web menu/landing/redirect，也不把
  尚未落地的 property route 暴露给用户。
- [ ] 不创建 preview route 或临时生产 route 来提前满足浏览器验收。
- [ ] Foundation 无 route-local response interface；领域 Web 等待 A-2.5 closure。
- [ ] 无 Track B 依赖且 open P0/P1 为零。

## 8. 2026-07-31 当前验收状态

Shared Web foundation 已由双域工作台共同消费，A-2.5、17 个 canonical pages、7 个
detail routes 与 Party target 均已交付。最终 API full unit 91/91、Web default
`tsc`/lint/build 154、独立多轮 Gate 通过，`open_P0_P1=[]`。

唯一未完成的是 Chrome connector `sandboxCwd` 基础设施导致真实 desktop/390
visual、keyboard、focus、zoom/reflow 未验；foundation 保持 `in_progress`，不得称
final UI Gate 或 release-ready 已完成。
