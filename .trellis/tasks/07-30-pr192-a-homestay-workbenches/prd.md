# PR192 A 民宿岗位工作台

## 1. 目标

在不改变现有民宿 URL/API/DTO/状态机和账务语义的前提下，把
`HomestayOperationsClient` 按工作流 extract-first 拆成可独立授权、可深链、
桌面与手机共用的 canonical 工作面。Track A 直接解决“一个万能页承载全部岗位”
和页面权限无法隔离的问题。

本任务只交付 Track A 民宿 Web 能力。它消费共享 access/response contract、
permission schema、API-only `/users/me` projection、共享 picker/task/upload 组件和
A-base 的冻结 SHA，不建立第二份契约。Web 菜单/landing 必须消费本任务完成后的
route SHA，不能成为本任务前置。

## 2. 用户与岗位任务

- 运营负责人：查看总览、房态和异常，不因拥有 dashboard 页面而获得写权限。
- 收益经理：维护基础价格和日期覆盖价。
- 前台：搜索订单、创建/确认订单、登记住客、办理允许的入住/离店动作。
- 保洁/复检：领取、开始、阻塞、完成周转任务并查看或提交授权证据。
- 民宿财务：查看授权后的订单金额和民宿子账；Track B enforce 前不执行需审批的
  高风险财务或冲正动作。

Persona 仅用于产品验收；实际授权只由 module、page permission、API permission、
data scope、field projection 和 file policy 决定。

## 3. Canonical IA

| 工作面 | Route | 责任 |
|---|---|---|
| 运营总览 | `/homestay/dashboard` | KPI、今日异常和授权后的快捷入口 |
| 今日任务 | `/homestay/tasks` | 本人/本岗位任务摘要、筛选、领取、轻动作和深链 |
| 房态日历 | `/homestay/availability` | 共享经营模式与占用的只读可用性投影 |
| 价格规则 | `/homestay/rates` | 基础日价、取消规则和日期覆盖价 |
| 订单管理 | `/homestay/bookings` | 列表、筛选、创建与允许的生命周期动作 |
| 订单详情 | `/homestay/bookings/[bookingId]` | 订单、住客、凭证、账务摘要和审计上下文 |
| 入住接待 | `/homestay/stays` | 今日到店/离店队列及 canonical 订单详情深链 |
| 保洁周转 | `/homestay/turnovers` | 周转队列、分页和岗位筛选 |
| 周转详情 | `/homestay/turnovers/[turnoverId]` | 执行、复检、异常、证据和关联工单 |
| 民宿财务 | `/homestay/finance` | 民宿子账只读投影及允许的普通登记 |

不得创建 `/homestay/terminal/*` 或另一套移动 CRUD。`/homestay` 只按父任务固定
优先级安全跳转；无 page permission 时显示模块专用 403，data scope 为空时进入
首个授权页的 `empty-scope`。

## 4. 功能要求

### 4.1 Extract-first

每个工作流必须依次完成 characterization test、共享 response contract 消费、
feature API、query/mutation hook、现有 UI block 抽取、原路由复用抽取结果并删除旧
block，确认行为等价后才能建立新 route。不得在万能页与新页面保留同一写操作的
双实现。

### 4.2 六层访问控制

- 只使用 `A-contract SHA` 冻结的 `packages/shared/src/property-business/**`。
- 每个 canonical route 恰好消费一个 page permission。
- 页面权限只允许加载页面；按钮/表单使用精确 action permission。
- 每个请求同时受 `homestay` module 和 tenant/park/unit/owner/assignee scope 约束。
- 住客身份、手机号、证件和财务字段只使用服务端授权投影；Web 不拼接敏感 label。
- 住客、签署、周转和财务附件同时要求领域权限、通用 file 权限和 unit scope。
- 未授权 optional block 不挂载、不发请求；wildcard 不绕过 module。

### 4.3 Track A 动作边界

允许执行的动作必须同时满足：现有 API 语义不变、manifest 未声明
`approvalPolicy`、拥有精确 action permission、当前状态和 scope 允许、重试写具备
稳定幂等键。典型低风险动作包括授权后的价格保存、订单草稿创建/确认/改期、住客
关联和周转任务普通执行。

退款、减免、账务冲正、强制释放、模式切换，以及 manifest 标注需 maker-checker
的取消/终止或其他高风险动作，在 Track B technical enforce 前仅显示只读状态或
“等待审批能力启用”，API 必须 fail closed；不得只隐藏按钮。

### 4.4 UX、移动与恢复

每页必须分别实现并测试：

- `initializing` 稳定 skeleton。
- `empty-initial`、`empty-filtered`、`empty-scope`。
- partial/full forbidden。
- 局部 failed/retry、offline/stale、409 conflict。
- submitting、success、destructive-confirm。
- 有附件页面的 queued/uploading/scanning/succeeded/failed/removing。
- 支持草稿的页面显示保存时间、设备范围、TTL 和清除动作；Track C 离线持久化前
  不得承诺刷新后保留。

列表的 filter/page/sort 写入 URL。详情必须可刷新、可分享；allowlist `returnTo`
恢复筛选、分页、排序和 scroll anchor。桌面可使用 intercepting drawer，但直接
刷新必须落到完整详情；手机使用同一 canonical detail 的全屏布局。

任务页只展示授权任务、授权 count、领取/开始/阻塞等轻动作，业务完成调用 owning
aggregate command，完成后可进入下一任务，不得把队列变成第二状态源。

所有实体选择使用共享远程 picker，不要求手填 UUID。选择器、附件和写表单在
module/tenant/park/scope/permission 变化时清除失效上下文并阻止提交。

## 5. 设计系统与无障碍

- 优先使用 `ds-page`、`ds-hero`、`ds-panel`、`ds-kpi-grid`、
  `ds-table-shell`、`ds-mobile-record-list` 和共享按钮/上传/预览组件。
- page-local CSS 只表达民宿布局差异，不重建颜色、shadow、border、button、table
  或 dialog 系统。
- 360px、390px 不出现页面级横向滚动；移动关键记录使用卡片，触控目标至少
  44×44 CSS px。
- 满足 WCAG 2.2 AA：键盘主流程、可见焦点、dialog trap/restore、错误关联和
  aria-live、NVDA/等价读屏、200%/400% zoom、320 CSS px reflow、forced-colors、
  reduced-motion、颜色对比和桌面/移动内容等价。

## 6. 不在范围

- 修改 API 业务规则、数据库 schema、菜单/RBAC migration 或共享 contract。
- 新建审批运行时、身份 snapshot、任务 assignment 或离线 mutation。
- OTA、支付、门锁、公安、电子签约接入。
- 民宿账务迁移到招商租赁财务表。
- 创建独立移动 terminal CRUD。

## 7. 验收标准

- [ ] 所有 canonical routes 已建立并与冻结 manifest 的 page permission 一一对应。
- [ ] `/homestay` 固定优先级跳转、module 403、page 403 和 empty-scope 组合通过。
- [ ] 每个迁移工作流只有一个 API/hook/UI 实现，旧 block 在同一变更中删除。
- [ ] route-local 不再声明共享 response interface；API 调用消费 shared contract。
- [ ] 精确岗位只看到授权菜单/页面/字段/文件/动作，未授权 block 不发请求。
- [ ] 所有可执行动作符合 Track A 动作边界；高风险动作只读且 API fail closed。
- [ ] 无表单要求输入 UUID；picker label 不泄露敏感字段。
- [ ] 页面状态矩阵、deep-link、刷新和返回上下文覆盖率 100%。
- [ ] 360/390/768/desktop、横竖屏、软键盘、键盘、读屏和 WCAG/DS 证据通过。
- [ ] 局部 mutation 不刷新三个以上无关上下文；失败保留最后成功投影。
- [ ] Web lint、typecheck/build、组件测试和精确角色浏览器 E2E 通过。
- [ ] 若本任务为首个 domain route SHA，已在真实 route 补齐 shared foundation 的
  desktop/mobile/keyboard/focus/zoom/ARIA 证据；未创建 preview/生产 route。
- [ ] 与 shared/menu/QA owners 的 handoff 记录无 open P0/P1。
