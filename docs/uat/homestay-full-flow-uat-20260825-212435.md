# 民宿模块全流程真实 Chrome UAT

## 元数据

- Commit / 执行者 / 起止时间：`b26cf4c3dc4f7b472e00d31febd08bd822b8aca3` / emvia（Codex）/ 2026-08-25 21:24:35 +08:00 / 2026-08-25 22:10 +08:00
- RUN_ID / compose project：`20260825-212435` / `jinhu-homestay-uat-20260825-212435`
- Chrome / MCP / viewport：Windows Chrome `151.0.7922.138` / CDP protocol `1.3` / desktop `1920×945`、窄窗请求 `390×844` 后浏览器实际 `500×844`（DPR 1、无横向溢出；不冒充真机）
- Web、API、DB 端口 / API、Web PID：`3102` / `3101` / `55435`；API 启动 PID `3811904`（监听子进程 `3811959`），Web 启动 PID `3810976`（监听子进程 `3811152`）
- 日志路径 / 开放限制：`/tmp/jinhu-20260825-212435/{api,web}.log`；Windows 桌面 Chrome，窄窗记录实际值，不冒充真机
- 报告：`docs/uat/homestay-full-flow-uat-20260825-212435.md`
- 本地证据（local-only）：`artifacts/homestay-uat-20260825-212435/`
- 方法权威：`docs/testing/windows-chrome-cdp-uat.md`（本轮已完整阅读）

## 设计依据清单

| 路径 | 关键结论 |
|---|---|
| `.trellis/tasks/archive/2026-08/07-24-homestay-mvp/prd.md` | 首期核心链为短租配置→价格/库存→预订确认→实名/凭证→入住退房→财务→周转恢复可售；无 OTA、在线支付、智能门锁、公安/住客端。 |
| `.trellis/tasks/archive/2026-08/07-24-homestay-mvp/design.md` | booking 状态为 `draft→confirmed→checked_in→checked_out`，旁支 cancelled/no_show；房态是经营配置、occupancy、入住和周转聚合，不是任意字段。 |
| `.trellis/tasks/archive/2026-08/07-24-homestay-mvp/implement.md` | 历史实现清单和必测场景仅作线索，不采信其 `[x]` 结论。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-completion-uat/{prd,design,implement}.md` | 收紧财务终态、任务 scope、深链、凭证 lost、维修权威入口和 Web 门禁；高风险离线 mutation fail-closed。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-booking-finance-boundaries/{prd,design}.md` | draft 禁普通财务；checked_out 只可对既有余额 payment；cancelled/no_show 只允许规则费用及审批 refund/waiver；非法组合 409。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-task-scope/{prd,design}.md` | task list/count 共用 tenant/park/unit/assignee fail-closed 谓词；公共到离店和未分配 turnover 队列仍可见。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-credential-turnover-repair/{prd,design}.md` | 凭证 `issued→lost` 幂等审计；周转异常只能关联同 scope/unit 的既有有效工单，民宿不伪造工单生命周期。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-deep-links/{prd,design}.md` | `taskId/requestId` 从授权 projection 解析；刷新/返回保留上下文；未知、跨 scope、无权安全降级。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-web-gates/{prd,design}.md` | loading/empty/403/404/409/stale/submitting、DS、390px、键盘焦点；不新增离线 mutation queue。 |
| `.trellis/tasks/archive/2026-08/08-20-homestay-api-browser-uat/{prd,design}.md` | 要求真实 API/角色/跨园区/并发/文件和多 viewport；mock 不替代真实证据。 |
| `docs/uat/homestay-mvp-evidence.md` | 08-20 历史证据仅作对照；明确自动化/浏览器结果不等于外部真人岗位具名签署。 |
| `packages/shared/src/property-business/*` | canonical route/access/permission/role bundle 与 asset 模块依赖。 |
| `AGENTS.md` | 共享 DS、移动优先、上传、秘密、财务审计、幂等、清理和报告纪律。 |

说明：简报指定的 `.trellis/tasks/archive/2026-08/07-30-pr192-a-homestay-workbenches/` 在当前 `b26cf4c3` 工作树不存在；全仓未找到等名归档。该设计源记为 `GAP-DESIGN-01`，不以相邻 B/C 任务推断其内容。

## 设计-实现闭环审计表

| 设计条目 | 设计闭环结论 | 实现状态 | 设计/实现证据路径 | gap / 阻断 |
|---|---|---|---|---|
| P-FOUNDATION-DATA-01 业务房源链与 unit scope | 闭合：民宿以 `biz_unit` 为权威 unit，后续迁移补复合 owner scope 与 occupancy 反向约束 | 已实现 | `database/migrations/000011_s2_biz_unit.sql:3`; `000176_shared_property_foundation.sql:32`; `000177_homestay_mvp.sql:1`; `000209_property_mvp_owner_scope_integrity.sql:89`; `000212_property_mvp_owner_scope_followup.sql:56` | 无；前提为全量迁移成功 |
| P-FOUNDATION-DATA-02 短租资格与授权 | 部分闭合：真实资格是 active/not-deleted + `short_stay/enabled` + actor unit scope；设计未权威定义 usage_type | 部分实现 | `apps/api/src/modules/homestay/homestay.service.ts:119`; `property-unit-access.service.ts:17`; `packages/shared/src/index.ts:338` | `GAP-FOUNDATION-01`：API 不校验 fixture 约定的 `usage_type=70`，也不联动 rental_status/available_date；底座冒烟可测真实契约，但不得宣称“单元类型”过滤闭合 |
| P-FOUNDATION-DATA-03 fixture 建链 | 闭合：prod seed 有 biz building/floor/unit，property fixture 可配置 short_stay 与 long_rent 对照 | 已实现 | `database/seeds/000003_s1_production_asset_bootstrap.sql:28`; `database/seeds/property-api-e2e-fixtures.sql:296` | 可进入环境；物理 `asset_*` 链仅在映射场景需要 |
| P-FOUNDATION-DATA-04 fixture 的真实 UI 建链 | 闭合：operation 列表会投影未配置 unit（`mode=none/version=0`），详情控制面可保存经营配置并申请模式切换；Party、identity submission、角色实例化和用户分配也有 UI | 已实现；本轮执行遗漏 | `property-operations.service.ts:102-168`; `PropertyFoundationControlClient.tsx:804-903`; `assets/parties/PartyWorkbenchClient.tsx:44`; `system/roles/page.tsx:673`; `system/users/page.tsx:735` | `EXEC-GAP-01`：本轮只看了列表空态，没有沿 unit drawer/detail 建链，随后错误使用 SQL fixture；因此所有依赖角色/identity 的结果必须降级，不能归因于产品缺功能 |
| P-FOUNDATION-API-01 审批注册/冻结策略/effect/proof/outbox | 闭合；取消和退款/减免均有生产请求入口，adapter 是 provider，registry 和 effect proof/outbox 调用完整 | 已实现 | `homestay.module.ts:55`; `homestay-approval.adapter.ts:42`; `homestay-booking-command.service.ts:264`; `homestay-finance.service.ts:260`; `property-approval.service.ts:1205,1329,3130` | 无死代码；进入审批分支 UAT |
| P-FOUNDATION-WEB-01 授权房源选择与 unit_id | 闭合于实际等价实现 `RemoteEntityPicker`：候选 API 过滤 short_stay/enabled/scope，选中 id 写入 booking/rate API | 已实现（命名偏离） | `features/property-shared/README.md:26`; `HomestayBookingCreatePanel.tsx:27,86`; `HomestayRatesClient.tsx:27,51`; `homestay.service.ts:124` | 简报名 `usePropertySelector` 不存在，但功能等价核心可进入底座冒烟 |
| P-FOUNDATION-WEB-02 候选关键词 | 设计闭合：08-20 要求最小关键词、服务端分页/限量 | 偏离设计 | `08-20-homestay-booking-finance-boundaries/design.md:3`; `picker/types.ts:15`; `HomestayBookingCreatePanel.tsx:27`; `HomestayUnitCandidateQueryDto` at `homestay.dto.ts:83` | `GAP-FOUNDATION-02`：loader 丢弃 query，API DTO 无 query；关键词过滤分支不进入 PASS 矩阵，记录 BLOCKED/gap |
| P-FOUNDATION-WEB-03 离线草稿 | 设计边界为创建表单状态保护、高风险写 fail-closed；未声明所有表单离线写 | 部分实现 | `HomestayBookingCreatePanel.tsx:60`; `use-property-draft.ts:43`; `08-20-homestay-web-gates/design.md:3` | `GAP-FOUNDATION-03`：仅 booking create 有草稿，恢复时不重验候选资格；只测创建草稿，其他表单离线恢复不宣称覆盖 |
| P-BOOKING-01 订单主状态机 | 闭合：六态及入口/出口清晰，无 settled/void booking 状态 | 已实现 | `000177_homestay_mvp.sql:54`; `homestay-booking-command.service.ts:63,155,201,248,303`; `homestay-stay-command.service.ts:166,218` | “结算”只能解释为 ledger balance，不得报告 booking settled |
| P-BOOKING-02 创建/确认/库存 | 闭合：draft+held occupancy+nights；confirm 激活 occupancy 并生成 room charge；GiST 排斥防重叠 | 已实现 | `homestay-booking-command.service.ts:63-198`; `000176_shared_property_foundation.sql:91-151` | 进入主链与冲突/双击分支 |
| P-BOOKING-03 改期/no-show/取消 | 闭合：改期原子换 occupancy；confirmed 降价拒绝；no-show 仅到达日后；取消走冻结审批 | 已实现 | `homestay-booking-command.service.ts:201-383`; `homestay-booking.policy.ts:31`; `homestay-cancellation-executor.service.ts:134` | 进入分支矩阵；日期选择须满足当前时钟规则 |
| P-STAY-01 住客/实名/凭证/入住 | 闭合于 identity evidence + issued credential + roster count + arrival window；敏感字段受策略 | 已实现 | `homestay-stay-command.service.ts:166-215`; `homestay-booking.policy.ts:65`; `homestay-field-policy.interceptor.ts` | `OBS-01`：primary guest 缺 DB 单一约束；并发双 primary 作为风险，不作为声明分支 |
| P-STAY-02 退房与周转生成 | 闭合：凭证先 returned/lost/void；退房释放 booking occupancy，唯一生成 turnover 与 operations occupancy | 已实现 | `homestay-stay-command.service.ts:218-267`; `000177_homestay_mvp.sql:244` | 进入主链 |
| P-TURNOVER-01 周转状态机 | 闭合：pending→cleaning→completed 或 inspection→completed；exception 可处置；完成释放 occupancy | 已实现 | `homestay-turnover.service.ts:155-242`; `000177_homestay_mvp.sql:215` | 进入普通/inspection/exception 分支；`OBS-02`：exception→complete 不强制照片/耗材/清空异常描述 |
| P-TURNOVER-02 维修边界 | 闭合且 fail-closed：仅关联工单模块创建的同 unit 有效工单，民宿不自动建单/伪造 maintenance | 已实现 | `08-20-homestay-credential-turnover-repair/design.md`; `HomestayTurnoverActions.tsx:21`; work-order candidate service | 只测“已有工单→关联”，不测设计明确 out-of-scope 的自动建单 |
| P-RATE-01 定价与快照 | 闭合：unit 唯一基础价、date override、逐夜快照；override 正数、base 可 0 | 已实现 | `homestay-rates.service.ts:34,88,200`; `homestay.dto.ts:181`; `000177_homestay_mvp.sql:1` | 进入定价/库存链与边界校验 |
| P-FINANCE-01 财务矩阵/余额 | 部分闭合：状态/类型矩阵稳定；detail 以 ledger charge 计算，但 finance workbench 从 `booking.total_amount` 起算 | 部分实现 | `homestay-finance.policy.ts:27-82`; `homestay-workbench-query.service.ts:527-551`; booking detail ledger summary | `GAP-FINANCE-01`：手工 charge 只插 ledger、不更新 booking.total_amount 时，finance list 与 detail 会分叉；本轮只测 payment，未触发该分支 |
| P-FINANCE-02 refund/waiver 审批 | 闭合：source allocation、锁、approval effect 唯一约束、审计/outbox | 已实现 | `homestay-finance.service.ts:68-341`; `homestay-transaction-support.service.ts:287`; `000191_property_b_homestay_effect_schema.sql:120` | 进入独立审批人分支 |
| P-FINANCE-03 前端退款权限 | 闭合：refund 在 service 同时要求 waive、approval:create 与 register；Web 的 register+waive 门禁与权威 service 一致 | 已实现 | `HomestayFinanceEntryPanel.tsx:76-85`; `homestay-finance.service.ts:75-89`; `access-manifest.ts:431-462` | 原 `GAP-RBAC-01` 经 review 点验撤销；不得建议弱化高风险财务权限 |
| P-RBAC-01 菜单/路由/page/action | canonical routes、动态菜单、route guard 和绝大多数 API action 权限闭合 | 部分实现 | `routes.ts:16-79`; `apps/web/lib/menu.ts:161,301`; `HomestayRouteGuard.tsx:8`; `homestay.controller.ts:50-475` | `GAP-RBAC-02`：shared 全部声明 asset dependency，但 API 类级仅 homestay、部分方法才额外 asset；模块启停负向必须实测，不能静态宣称一致 |
| P-RBAC-02 task 角色 bundle | 设计要求经办人能读取/领取未分配 turnover | 部分实现 | `permission-bundles.ts:35-42,164-175`; `access-manifest.ts:240` | `GAP-RBAC-03`：Track-B `HOMESTAY_TASK_OPERATOR` bundle 未含 `homestay:task:read`；若 fixture 实例化无补充权限，task 岗链 BLOCKED |
| P-SCOPE-01 tenant/park/unit/assignee | 设计和查询均 fail-closed，list/count 共用范围谓词 | 已实现 | `homestay-booking-query.service.ts:107`; `homestay-workbench-query.service.ts:239`; `08-20-homestay-task-scope/design.md` | 进入跨园区/窄 scope Case |
| P-WEB-01 三态/响应式/深链 | 列表/详情有 loading/empty/403/404/409/stale/submitting 与移动卡片，returnTo 白名单 | 已实现 | `HomestayListClient.tsx:94`; `HomestayDetailClient.tsx:31,152`; `HomestayListRecords.tsx:84`; `HomestayWorkbench.module.css:56` | 进入真实浏览器交互与窄窗 |
| P-WEB-02 OTA/门锁/外部同步 | 设计明确 out-of-scope，仅预留状态 | 未实现（符合边界） | `07-24-homestay-mvp/prd.md` Out of Scope；booking/stay command `reserved_not_connected` | 不进入矩阵，不算 gap |

### 阶段 0 结论与 gap 清单

- 可进入浏览器的闭合段：真实资格候选与 unit_id、定价、预订创建/确认、普通 payment、dashboard/房态/任务投影。
- 设计/实现 gap：`GAP-DESIGN-01` 缺失设计源；`GAP-FOUNDATION-01` usage_type/资格边界；`GAP-FOUNDATION-02` 候选关键词未接线；`GAP-FOUNDATION-03` 离线草稿仅部分适配；`GAP-FINANCE-01` 手工 charge 的 list/detail 公式分叉；`GAP-RBAC-02` asset dependency API 装饰器不统一；`GAP-RBAC-03` task operator bundle 缺 task read。另有本轮未沿既有 UI 完成 fixture 建链的 `EXEC-GAP-01`，它不是产品 gap。
- 主链不因命名偏离整体阻断：`RemoteEntityPicker` 已提供选择、资格 API 与 `unit_id` 写入；搜索分支单独降级。
- 本轮不修改产品代码；后续若真实 UI 暴露与以上 gap 相同的现象，仍记 gap/BLOCKED，不重复计产品 FAIL。

## 流程链矩阵

| 流程链编号 | 角色 | 页面序列 | 状态迁移 | 分支/异常 | 适用 Case |
|---|---|---|---|---|---|
| FLOW-00 | 管理员/业务岗 | 房产经营配置（fixture 前置）→`/homestay/bookings` 创建面板→`/homestay/rates` | unit 无资格→short_stay/enabled→候选可见；选择后 body/path 使用同一 `unit_id` | long_rent/disabled/无 unit scope 不可见；关键词搜索为 gap | C00-A/C00-B |
| FLOW-01 | 民宿运营 | rates→availability→bookings→booking detail | base/override→draft+held→confirmed+active+room charge | 必填/金额/日期边界；同夜冲突；快速双击；改期成功/冲突/confirmed 降价 409 | C01-A…E |
| FLOW-02 | 前台/管家 | stays→stay detail→guest/credential→check-in→check-out | confirmed→checked_in→checked_out；issued→returned/lost；生成 pending turnover | 人数上限；未核验/无凭证拒绝；凭证 lost 幂等；no-show | C02-A…E |
| FLOW-03 | 财务+独立审批人 | finance→booking detail→approval deep link→finance | charge/payment→部分余额；refund/waiver pending→executed→余额更新 | draft/terminal 非法动作 409；source 超额；窄权限 refund gap | C03-A…E |
| FLOW-04 | 保洁/管家 | tasks/turnovers→turnover detail→上传/执行/复检→availability | pending→cleaning→inspection/completed；operations occupancy→completed | exception→关联同 unit 已有工单→复检；跨 unit 工单拒绝；未完成不可售 | C04-A…D |
| FLOW-05 | 管理员/业务岗 | dashboard→各列表/详情 | KPI/队列/财务/房态与事实同步 | 列表筛选、分页、后退、returnTo、taskId/requestId | C05-A…C |
| FLOW-06 | 业务岗/窄权限/跨园区岗 | login→菜单→民宿页面→登出→另一账号→园区切换 | 权限/范围随会话和 current park 变化 | 403/404 不泄露；模块依赖；storage/cookie 残留控制；task bundle gap | C06-A…D |

## Case 矩阵（冻结后执行结果）

| Case | 流程链编号 | 角色/范围 | 交互路径与核心断言 | viewport | 结果 |
|---|---|---|---|---|---|
| C00-A | FLOW-00 | 管理员/当前园区 | 创建面板仅列 short_stay/enabled；选择后创建；DB booking.unit_id 等于选中 unit | desktop | PARTIAL：交互/DB 观察成立，但无持久化截图/原始 evaluate 证据，不计 PASS |
| C00-B | FLOW-00 | 受限 unit 岗 | short_stay/enabled 可见，long_rent/disabled 不可见；输入无关 `ZZ` 仍返回 SHORT | desktop | GAP/BLOCKED（GAP-FOUNDATION-02；本轮未用既有 UI 建受限账号） |
| C01-A | FLOW-01 | 运营 | rates 必填校验→保存 base 688/取消 24h/固定费 50/需检查→14 日显示 688→创建 draft；保存与创建快速双击各仅 1 次写请求/1 行 | desktop | FAIL：首次正常空态 404 泄漏 Console，且 override 分支未执行 |
| C01-B | FLOW-01 | 运营 | confirm→active occupancy+688 charge；详情、finance、dashboard、availability、tasks 同步 | desktop+narrow | FAIL：confirmed 被错误投影为 occupied/在住，见 FAIL-02 |
| C01-C | FLOW-01 | 运营 | 同夜冲突 | desktop | BLOCKED：主 fixture 必须保留供后链，未建立可清理的第二独立角色/订单链 |
| C01-D | FLOW-01 | 运营 | 改期及冲突/降价 | desktop | BLOCKED：未建立第二合法库存链 |
| C01-E | FLOW-01 | 运营+审批 | 取消审批 | desktop | BLOCKED：无独立审批账号；不以管理员自批伪造证据 |
| C02-A | FLOW-02 | 前台 | 住客、实名、凭证、入住 | desktop+narrow | BLOCKED：候选为空且空环境无 UI 住客/identity fixture 建链 |
| C02-B | FLOW-02 | 前台 | 无实名入住拒绝且状态不变 | desktop | PARTIAL：拒绝与 DB 状态观察成立，但无持久化 Case 证据 |
| C02-C | FLOW-02 | 前台 | issued→lost 重放 | narrow | BLOCKED：依赖 C02-A |
| C02-D | FLOW-02 | 前台 | 退房→turnover | desktop+narrow | BLOCKED：依赖 C02-A |
| C02-E | FLOW-02 | 前台 | no_show | desktop | BLOCKED：为保留主证据未破坏式终结唯一订单，且无第二订单链 |
| C03-A | FLOW-03 | 财务 | confirmed payment 300→已收 300、余额 388；DB charge/payment 各一条；快速双击仅一条 payment | desktop+narrow | PARTIAL：仅部分 payment，未测全额/手工 charge，且无持久化 Case 证据 |
| C03-B | FLOW-03 | 财务 | 非法财务矩阵 | desktop | BLOCKED：缺各终态独立订单 fixture |
| C03-C | FLOW-03 | 财务+审批人 | refund 审批 | desktop | BLOCKED：无独立审批账号 |
| C03-D | FLOW-03 | 财务+审批人 | waiver 审批 | desktop | BLOCKED：无独立审批账号 |
| C03-E | FLOW-03 | 窄财务岗 | register-only/waive-only 前端入口与 API 契约对照 | desktop | BLOCKED：本轮未用既有 UI 建角色；静态点验表明 refund 双权限契约一致 |
| C04-A | FLOW-04 | 保洁 | 周转执行 | narrow | BLOCKED：依赖退房 |
| C04-B | FLOW-04 | 保洁/检查 | 检查型周转 | narrow | BLOCKED：依赖退房 |
| C04-C | FLOW-04 | 保洁+维修 | 异常/工单 | desktop+narrow | BLOCKED：依赖退房和独立工单 fixture |
| C04-D | FLOW-04 | 运营 | turnover 可售门禁 | desktop | BLOCKED：依赖退房 |
| C05-A | FLOW-05 | 管理员 | dashboard 与列表/DB 一致性 | desktop+narrow | FAIL：到店=1、已收=300 与事实一致；confirmed 被统计为“在住房间/occupied”，与 C01-B 为同一缺陷 |
| C05-B | FLOW-05 | 业务岗 | 深链/返回上下文 | desktop | PARTIAL：观察到 booking/stay/tasks/finance returnTo；筛选分页数据量与持久化证据不足 |
| C05-C | FLOW-05 | 业务/审批 | taskId/requestId 深链 | desktop+narrow | BLOCKED：无 approval projection |
| C06-A | FLOW-06 | 管理员代业务 | 真实登录→菜单/动作→真实登出 | desktop | PARTIAL：管理员交互成立，但无独立业务岗与持久化 Case 证据 |
| C06-B | FLOW-06 | 窄权限岗 | 403/隐藏 | desktop | BLOCKED：无合法 UI 角色 fixture 链 |
| C06-C | FLOW-06 | 跨园区岗 | 园区切换数据范围 | desktop | BLOCKED：仅一个园区，切换控件 disabled |
| C06-D | FLOW-06 | task operator | 菜单与 `/homestay/tasks` API 对照 | desktop | GAP-RBAC-03；fixture 无补权时 BLOCKED |
| C-UX | 全部 | 适用角色 | 三态、console/network、双击、窄窗 | desktop+实际窄窗 | PARTIAL：空态/错误态/双击与 500px 无溢出已测；缩放、forced-colors、离线草稿未测 |

## Fixture 与 residual 审计清单（执行前冻结）

fixture 前缀统一为 `UAT_HOMESTAY_20260825-212435_`。建链顺序：production baseline tenant/park → 第二园区（若需）→ biz building/floor/unit → operation config 与 unit access → parties/identity → users/roles/permissions/data scopes → rates/bookings/occupancies → approvals/files/work orders。

逐表 before/after/residual=0 清单：

- 基础身份与范围：`sys_user`/实际 users 表、user-role/role-permission/tenant-module/park-user/data-scope 关系表（以迁移后的实际表名为准）、`biz_tenant`、`biz_park`。
- 房源：`biz_building`、`biz_floor`、`biz_unit`、`asset_park`、`asset_building`、`asset_floor`、`asset_unit`、`biz_property_operation_config`、`biz_property_mode_transition_log`、`biz_property_occupancy`。
- 民宿：`biz_homestay_rate_config`、`biz_homestay_rate_override`、`biz_homestay_booking`、`biz_homestay_booking_night`、`rel_homestay_booking_guest`、`biz_homestay_stay_credential`、`biz_homestay_ledger_entry`、`biz_homestay_turnover_task`、`biz_homestay_booking_action_log`。
- 依赖副作用：`biz_party` 及 identity evidence 表、property approval request/policy/effect/receipt/outbox/incident 表、idempotency 表、work order/handler 表、file metadata 表。
- 物理文件：精确根 `/tmp/jinhu-20260825-212435-files`。

每张实际触达表在 fixture 写入前记录 `RUN_ID`/fixture ID 范围 count，在清理后用相同谓词证明 0；软删除行仍算 residual，必须物理清除本轮隔离库中的 fixture。

## 执行结果

### Case 证据与统计

- 环境五步初始化及三门禁：迁移 `248/248` 成功（既有重复 `000136` 仅告警）；production seed 成功；bootstrap 前 strict baseline 按预期仅缺管理员；bootstrap 后 strict baseline 全部通过；`/health`、`/ready`、登录页均通过。首次 API 编译暴露 stale shared dist，执行 `pnpm --filter @jinhu/shared build` 后零错误；属于环境修复，未改源码。
- Codex review 后按 SOP 证据门禁重分类 28 个业务 Case：PASS 0、FAIL 3、PARTIAL 5、BLOCKED 18、GAP/BLOCKED 2；另 C-UX 为 PARTIAL。3 个 FAIL Case 对应 2 个独立产品缺陷（C01-B/C05-A 为同一房态缺陷）。结论：**FAIL / 不可发布为“民宿全流程已通过”**。
- 网络关键证据：rate PUT、booking POST、confirm POST、ledger POST 在快速双击下各只产生一次成功写；对应 DB 为 1 booking、1 night、1 occupancy、2 ledger（charge 688、payment 300）、2 action log。
- Console：价格配置首次读取不存在的资源发出两次 HTTP 404 Console error；后续 dashboard/availability 页面无 error，存在开发模式 React DevTools/Fast Refresh 信息和表单缺 id/name 的 DevTools issue。
- 看板/列表事实：今日到店 1、ADR 688、收入 300、余额 388、岗位到店任务 1 均与订单/ledger 一致；但 confirmed（尚未入住）在 dashboard 显示“在住房间 1”、availability 显示 `occupied`。

### local-only 截图索引

截图工具拒绝将 CDP 截图写入仓库 local-only 根（报告为 workspace-root 限制）；没有伪造或改存截图。`artifacts/homestay-uat-20260825-212435/` 保持空目录且不入 Git。真实浏览器 accessibility snapshot、network/console 与 DB 查询仅是本轮瞬时观察，无法供 PR review 持久核验；按 SOP §6 与 Codex review，所有原 PASS 已降为 PARTIAL 或 FAIL，本轮 **PASS=0**。

## 清理审计

- UI 点击退出并确认到 `/login`，随后 UAT tab 导航 `about:blank`；未关闭用户主 Chrome，也未停止专用 CDP Chrome。
- 清理前触达：booking 1、night 1、ledger 2、action 2、rate_config 1、operation_config 3、unit 3、occupancy 1、idempotency 5；guest/credential/turnover/rate_override 均 0。
- 按 booking/unit/RUN_ID 精确物理删除后，上述 12 个民宿/房源触达面、idempotency、RUN_ID user/tenant/park 均为 0。bootstrap RUN_ID user 及其 user-role/user-park/user-org 关系也已删除。未创建 party/identity/approval/outbox/work-order/file 行；本地文件根无文件。
- 先核验 PID cwd/PGID 与监听 fd，再仅对本轮 API/Web 进程组发 INT；3101/3102 归零。compose 使用原 project/file/env 参数 `down --volumes --remove-orphans`；project label 下 container/volume/network 均为空，55435 归零。
- 清理前后全机容器清单 diff 为空；没有启动、停止或删除 phoenix、固定 `jinhu-smart-park-postgres` 或其他用户容器。0600 临时 env、临时 compose、fixture SQL 已精确删除，日志保留于 `/tmp/jinhu-20260825-212435/`（无密码/JWT 输出）。

## 仓库验证

- `pnpm lint`：PASS（shared、ui、api、web）。
- `pnpm typecheck`：PASS（shared、ui、api、web）。
- `pnpm --filter @jinhu/shared build`：PASS（隔离 API 首次启动时刷新 stale dist）。
- `git diff --check`、敏感模式扫描、产品目录 diff=0：PASS。
- 未另跑全量 `pnpm test`/`pnpm build`：本 PR 仅新增 Markdown/Trellis 工件，产品源码零改动；由 PR CI 继续执行仓库 required checks。

## 发现与闭环

- `FAIL-01`：未配置 rate 的正常空态以 404 返回并在 Console 报错两次；UI 虽能继续配置，但不满足 SOP 的“Console 零未解释错误”。根因假设：前端把资源不存在当空态，但仍通过通用 fetch 打印 404。
- `FAIL-02`：confirmed、实际未入住的订单在 availability 显示 `occupied`，dashboard 计入“在住房间 1/入住率 100%”。数据库 occupancy 的 active 语义被直接映射成入住语义，和 `actual_check_in_time IS NULL`、booking.status=confirmed 不一致；会误导经营指标。
- gap：`GAP-DESIGN-01`、`GAP-FOUNDATION-01..03`、`GAP-FINANCE-01`、`GAP-RBAC-02..03`；`GAP-RBAC-01` 与 `GAP-FOUNDATION-04` 经 review 点验撤销。`EXEC-GAP-01` 是本轮未沿既有 UI 建 fixture 的执行缺口。
- UAT 结论：**FAIL，PASS=0，且 18 个 Case Blocked、2 个 Case Gap/Blocked、5 个 Case Partial**。瞬时观察不能外推为可审计通过；产品代码零改动。
- 建议优先级：P0 修正 confirmed/occupied KPI 语义；P1 修复 rate 空态 404、候选 query 与 finance 手工 charge list/detail 公式；P2 收敛 asset dependency/task bundle 权限契约。复测必须先用现有 operation/party/identity/role/user UI 完成全 fixture 链，并确保截图/evaluate 写入可审计 local-only 根。
- 发布状态：报告 PR [#382](https://github.com/ivanzhao299/jinhu-smart-park/pull/382) 已创建；review/CI/merge/Deploy 在后续收尾填写，与 UAT 产品结论分开记录。
- 外部真人门：即使本轮自动化操作者真实 Chrome UAT 全部通过，也不替代 `homestay-mvp-evidence.md` 定义的多岗位真人代表具名签署，除非用户另行完成该外部门。
