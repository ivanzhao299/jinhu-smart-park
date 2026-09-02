# 民宿管理与长租经营中文名称显示专项核查

> 核查日期：2026-09-02
>
> 核查性质：静态代码与 API 契约调查（零产品代码改动）
>
> 结论状态：待产品/研发复核；本报告不授权实施修复

## 1. 结论摘要

本轮共核查 27 个页面路由：民宿 12 个（8 个 canonical surface、3 个详情、1 个 legacy landing），长租 15 个（9 个 canonical surface、4 个详情、1 个 legacy landing、1 个租客详情兼容入口）。确认并归并 30 个“应显示中文名称却显示码值/内部 ID，或无法显示名称”的问题单元。

| 根因 | 定义 | 数量 | 占比 |
| --- | --- | ---: | ---: |
| A | 前端缺少展示转换或采用了不当 ID/占位回退 | 2 | 6.7% |
| B | API/共享响应契约缺少名称字段，前端无法可靠显示 | 3 | 10.0% |
| C | 仓库已有中文映射/名称资产，但页面漏用或局部资产漂移 | 19 | 63.3% |
| D | 仓库中没有可确认的中文产品定义，需产品定名 | 6 | 20.0% |
| **合计** |  | **30** | **100%** |

最主要根因不是“后端都没给名称”，而是中文映射分散在筛选器、创建表单和房产控制面中，列表/详情没有复用。优先建立单一领域 label 层，可一次消除大部分 C 类问题；B 类只集中在民宿订单详情、住房任务负责人、采购关联房源三条响应投影。

## 2. 范围与方法

### 2.1 页面覆盖

民宿：

- legacy landing：`/homestay`
- canonical surfaces：`/homestay/dashboard`、`/homestay/tasks`、`/homestay/availability`、`/homestay/rates`、`/homestay/bookings`、`/homestay/stays`、`/homestay/turnovers`、`/homestay/finance`
- details：`/homestay/bookings/[bookingId]`、`/homestay/stays/[stayId]`、`/homestay/turnovers/[turnoverId]`

长租：

- legacy landing：`/housing`
- canonical surfaces：`/housing/dashboard`、`/housing/tasks`、`/housing/tenants`、`/housing/leases`、`/housing/handovers`、`/housing/billing`、`/housing/finance`、`/housing/repairs`、`/housing/purchases`
- details：`/housing/leases/[leaseId]`、`/housing/handovers/[handoverId]`、`/housing/repairs/[repairId]`、`/housing/purchases/[purchaseId]`
- compatibility：`/housing/tenants/[partyId]` 跳转 `/assets/parties/[partyId]`

路由权威清单在 `packages/shared/src/property-business/routes.ts:17-230`；菜单由该清单生成，见 `apps/web/lib/menu.ts:142-167`。`/homestay`、`/housing` 是 legacy landing，canonical landing 分别是 dashboard；租客详情兼容入口见 `apps/web/app/housing/tenants/[partyId]/page.tsx:1-9`，跳转由 `apps/web/features/property-shared/access/capability-adapter.ts:440-484` 解析。

### 2.2 判定口径

- 逐页追踪表格/移动卡片、详情字段、只读态、KPI、picker 回显、空态和错误文本。
- `StatusPill` 未传 `dictCode/dicts` 时会直接显示原值，见 `packages/ui/src/components/StatusPill/StatusPill.tsx:24-33`；此类调用不能视为已中文化。
- 关联实体优先展示名称；业务编号可与名称并列，但 UUID/内部 ID 不作为正常回退。
- 单个问题只记主根因。若同时有次要依赖，在建议中说明，不重复计数。
- 仅依据仓库静态证据，不访问生产、不抽取真实数据、不把推测写成事实。

## 3. 问题矩阵

### 3.1 民宿管理

| 编号 | 页面/字段 | 当前显示样例（描述性） | 根因 | 证据 | 建议修法 |
| --- | --- | --- | :---: | --- | --- |
| HCD-001 | `/homestay/tasks`：任务来源、状态 | `homestay_arrival`、`pending` | C | `apps/web/app/homestay/_components/HomestayListRecords.tsx:88-93` 直出；筛选中文资产在 `HomestayListClient.tsx:213-232` | 复用统一 task source/status label；`StatusPill` 接收已映射 label/variant。 |
| HCD-002 | `/homestay/availability`：经营模式 | `short_stay` | C | `HomestayListRecords.tsx:96-103` 直出；现有中文资产 `OPERATING_MODE_LABELS` 在 `apps/web/components/property/PropertyFoundationControlClient.tsx:137-147` | 将经营模式/状态稳定标签提升为共享领域资产，房态页复用。 |
| HCD-003 | 订单、入住、财务列表及订单/入住详情：订单状态 | `confirmed`、`checked_in` | C | `HomestayListRecords.tsx:107-118,128-134`、`HomestayDetailClient.tsx:204-213`；值域在 `packages/shared/src/index.ts:399-407`，筛选器已有部分中文 | 建立完整 booking status map（含 `no_show`），列表/详情/筛选同源。 |
| HCD-004 | 周转列表、详情及订单关联周转：周转状态 | `cleaning`、`inspection` | C | `HomestayListRecords.tsx:121-125`、`HomestayDetailClient.tsx:238-240,289-295`；值域在 `packages/shared/src/index.ts:409-416` | 建立 turnover status map，替换裸 `StatusPill`。 |
| HCD-005 | 订单详情：住客核验、凭证状态 | `unverified`、`issued` | D | `HomestayDetailClient.tsx:223-228`；核验值域见 `packages/shared/src/property-business/response-contracts.ts:205-215`，凭证状态无统一中文资产 | 产品确认核验与凭证状态中文名称后加入领域 map。 |
| HCD-006 | 订单详情、退款/减免来源 picker：流水类型 | `charge`、`payment` | C | `HomestayDetailClient.tsx:231-237`、`HomestayFinanceEntryPanel.tsx:126-136`；同表单已有“费用/收款/退款/减免”，共享值域在 `packages/shared/src/index.ts:418-424` | 提取并复用 ledger entry type map。 |
| HCD-007 | 订单详情：流水状态、审计 action | `confirmed`、`booking_confirmed` | D | `HomestayDetailClient.tsx:235-243` 直出；现有合同为开放字符串，未找到完整中文定义 | 产品给出流水状态和 action 目录；before/after status 使用相应领域状态 map。 |
| HCD-008 | 周转详情、工单 picker：工单状态 | 数字/英文工单状态码 | C | `HomestayDetailClient.tsx:289-296`、`HomestayTurnoverActions.tsx:21-35`；工单模块已有状态展示资产 | 复用工单统一状态 label，picker secondary label 与详情一致。 |
| HCD-009 | 高风险操作成功提示：审批决策/执行状态及 requestId | `pending_approval`、`not_started`、内部申请 ID | C | `HomestayDetailClient.tsx:88-91`、`HomestayFinanceEntryPanel.tsx:47-50`；现有中文 map 在 `PropertyFoundationControlClient.tsx:157-172,1024-1029` | 状态复用审批 map；主提示显示中文结果，内部 ID 移到带“申请编号”的次要信息。 |
| HCD-010 | 订单详情：每日房价来源 | `date_override` | C | `HomestayDetailClient.tsx:218-220` 直出；价格页已有“日期覆盖价/基础价”，见 `HomestayRatesClient.tsx:227-231` | 抽取 price source formatter 并在详情复用。 |
| HCD-011 | 订单/入住详情：房源 | 固定“已关联房源”，无法显示名称 | B | Web 在 `HomestayDetailClient.tsx:204-213` 使用固定占位；共享 `HomestayBookingResponse` 仅有 `unitId`，而列表才有 `unitCode/unitName`，见 `response-contracts.ts:174-194`；API projection 同样只投影 ID | 详情响应补 `unitCode`、`unitName`；若业务要求跨园区/楼栋辨识，再补 `buildingName`、`parkName`，不要前端 N+1 查询。 |
| HCD-012 | 列表 URL 恢复后的房源 picker | 固定“已选择房源” | A | `apps/web/app/homestay/_components/use-homestay-list-state.ts:105-120` | 用 `/homestay/unit-candidates` 按已选 ID 恢复 `unitCode · unitName`，加载中显示中文暂态，失败显示“已选房源不可用”。 |
| HCD-013 | 列表、详情、价格、财务操作：错误信息 | 英文 API message/机器字段值 | C | `use-homestay-list-state.ts:160-169`、`HomestayDetailClient.tsx:94-99`、`HomestayFinanceEntryPanel.tsx:52-53`；已有局部 `homestayErrorMessage` 在 `homestay-workbench.logic.ts:40-52` | 扩充并统一错误投影；保留 request id 供排障，但主文案中文化。 |
| HCD-014 | 订单/周转筛选：状态值域 | `no_show` 无选项；`open` 不在 shared 周转值域 | C | `HomestayListClient.tsx:227-232`；权威值域 `packages/shared/src/index.ts:399-416` | 筛选由共享枚举+label 生成，删除局部漂移；确认 `open` 是聚合筛选语义还是错误状态值。 |

### 3.2 长租经营

| 编号 | 页面/字段 | 当前显示样例（描述性） | 根因 | 证据 | 建议修法 |
| --- | --- | --- | :---: | --- | --- |
| HCD-015 | `/housing/tenants` 与 Party 详情：核验/同意状态 | `verified`、`granted` | D | `HousingRentalSurfaceClients.tsx:59-73`；兼容目标 `apps/web/app/assets/parties/PartyDetailClient.tsx:118-129,288-305`；共享字段仍为 string，见 `response-contracts.ts:744-763` | 产品确认 Party 核验、consent fact/status 中文目录后统一映射。 |
| HCD-016 | 租约列表/详情/账单：租约状态与筛选 | `pending_signature`、`terminated`；筛选错误含 `closed` | C | `HousingRentalSurfaceClients.tsx:86-105`、`HousingLeaseDetailClient.tsx:90-95`、`HousingCostSurfaceClients.tsx:20-35`；局部 options 在 `HousingSurfacePrimitives.ts:3-8`，与 shared `HOUSING_LEASE_STATUSES`（`packages/shared/src/index.ts:426-436`）不一致 | 用 shared 值域生成完整 label map，补 `expiring/terminated`，移除非契约值 `closed`。 |
| HCD-017 | 租约列表：房源资格阻断原因 | `OPERATION_MODE_NOT_LONG_RENT` | C | 列表直出在 `HousingRentalSurfaceClients.tsx:94-101`；详情已有映射 `HousingLeaseDetailClient.tsx:130-140` | 将 eligibility reason map 提升到 housing feature shared，列表/详情同源；未知值显示“未知阻断原因”并记录原码。 |
| HCD-018 | 交割列表、详情、租约内嵌记录：交割状态 | `draft`、`completed` | C | `HousingRentalSurfaceClients.tsx:118-133`、`HousingEntityDetailClients.tsx:30-40`、`HousingLeaseDetailClient.tsx:159-163`；筛选已有“草稿/已完成” | 提取 handover status map，所有展示面复用。 |
| HCD-019 | `/housing/tasks`：任务来源、状态 | `housing_repair`、`active` | C | `HousingOverviewSurfaceClients.tsx:123-139`：列直出而筛选已有中文 | 统一 property workbench task source/status map，民宿与长租共同使用。 |
| HCD-020 | `/housing/tasks`：负责人 | 直接显示 assignee UUID | B | Web `HousingOverviewSurfaceClients.tsx:124-128` 直出 `assigneeId`；共享 `PropertyWorkbenchTaskItem` 只有 ID，见 `response-contracts.ts:315-328`；API task projection也无姓名 | API task projection 补 `assigneeName`；未分派/名称不可用时显示中文占位，不回退 UUID。 |
| HCD-021 | 租约详情：租客/入住人员名称回退 | 名称缺失时显示 Party UUID | A | `HousingLeaseDetailClient.tsx:90-95,146-153`；响应已有可空 `displayName/partyDisplayName`，见 `response-contracts.ts:495-518` | 名称缺失显示“未命名租客/未命名人员”，内部 ID 仅放受控技术信息。 |
| HCD-022 | 租约详情：入住人员角色 | `cohabitant`、`emergency_contact` | C | `HousingLeaseDetailClient.tsx:150-152` 直出；新增人员表单已有“同住人/紧急联系人”在 `HousingLeaseSecondaryActions.tsx:179-182` | 提取 occupant role map 并复用。 |
| HCD-023 | 报修列表/详情：优先级、紧急程度、状态 | `high`、`critical`、`40` | C | `HousingCostSurfaceClients.tsx:68-92`、`HousingEntityDetailClients.tsx:49-62`；创建表单已有优先级/紧急程度中文，列表筛选已有部分工单状态中文 | 复用工单状态资产；补齐状态 60/70/90/91；提取 repair priority/urgency map。 |
| HCD-024 | 采购列表/详情：审批、付款状态 | `approved`、`unpaid` | C | `HousingCostSurfaceClients.tsx:102-120`、`HousingEntityDetailClients.tsx:78-87`；审批筛选已有中文，付款值域为 `unpaid/paid/refunded` | 建立 purchase approval/payment map，列表/详情/筛选同源。 |
| HCD-025 | 账单费用计划 picker：计费来源 | `fixed`、`energy_meter` | C | `HousingBillingActions.tsx:145-151,160-178`：创建 select 已中文，picker 回显仍直出 | 提取 billing source map，option label 与表单共用。 |
| HCD-026 | 账单/财务 picker、审批目标：费用类型与支付方式 | `rent`、`checkout_deduction`、自定义 payment method | D | `HousingBillingActions.tsx:145,174`、`HousingFinanceActions.tsx:151-166,183-187`；API `chargeType/paymentMethod` 为开放 string | 产品确定标准费用类型、支付方式及是否允许租户字典扩展；固定值进 shared，租户可配值走 `/dict-items`。 |
| HCD-027 | 采购列表/详情：关联房源 | API 只有 `unitId`，页面无法显示房源中文名称 | B | 共享采购响应 `response-contracts.ts:699-733` 仅有 `unitId`；`apps/api/src/modules/housing/housing-purchase.service.ts:63-149,163-214,533-550` 无 unit join | purchase list/detail projection 补 `unitCode/unitName`；页面新增“房源”字段，未关联显示“未关联房源”。 |
| HCD-028 | Party 详情：角色类型、来源、状态、consent provenance | `tenant`、`housing_lease`、`operator_recorded` | D | `PartyDetailClient.tsx:118-129,288-305` 直出，未找到完整中文产品定义 | 产品确认角色/来源/同意证据来源中文目录；与 shared source-type 资产合并，避免重复。 |
| HCD-029 | 身份/审批控制面：审批执行状态、来源 | `not_started`、`housing_lease` | C | `apps/web/components/property/PropertyControlPlaneClient.tsx:903-915` 直出；已有 decision/execution/source 中文 map 在 `PropertyFoundationControlClient.tsx:157-183,1024-1033` | 将审批与来源 map 从单页私有常量提升为 Web/shared 领域资产并复用。 |
| HCD-030 | 身份 submission、通知/事件、retention action/state | `pending_verification`、筛选项 `unread`、`restrict_processing` | D | 身份筛选选项与部分列表字段直出见 `PropertyControlPlaneClient.tsx:68-80,140-146,897-915`（通知列表本身已将 `unread` 投影为“未读”）；retention API 默认原值在 `apps/api/src/modules/property-identity/party-data-governance.service.ts:307-320,475-479`；identity/approval 值域见 `packages/shared/src/property-business/track-b-contracts.ts:23-53`，不包含 retention action | 产品统一定名 submission/notification/incident/failure-side/retention action/legal-review 状态；未形成 Web 展示的 retention 值先只入定名目录，不虚构页面缺陷。 |

## 4. 已正确使用名称/中文标签的覆盖点

以下不是问题，保留用于证明本轮不是仅搜索 raw 字符串：

- 民宿 dashboard KPI、快捷入口、空态均为中文；房态 `room_state` 通过 `homestayRoomStatePresentation()` 完整映射，见 `HomestayListRecords.tsx:76-103` 与 `homestay-workbench.logic.ts:24-43`。
- 民宿列表房源已使用 `unitCode/unitName`，周转负责人已使用 `assigneeName`；住客候选使用 `displayName`。
- Housing 租客 picker 使用 `displayName`，房源 picker 使用 `unitCode · unitName`，租约 picker 使用租约编号并带房源/租客名称，见 `apps/web/features/housing/pickers/loaders.ts:35-67`。
- Housing 租约、交割、报修、账单、财务 API 已普遍返回 `unitCode/unitName` 或 `tenantDisplayName`；不是所有关联显示都需要后端改造。
- 经营模式控制面已将 `none/short_stay/long_rent` 映射为“不经营/民宿短租/长租经营”，经营状态、占用状态、审批状态也已有中文资产，见 `PropertyFoundationControlClient.tsx:137-183`。
- 两模块 landing、权限/离线/冲突/空态壳、not-found 文案未发现裸码值。

## 5. API 契约结论与后端补字段清单

### 5.1 明确需要后端补字段

| API | 当前契约 | 建议字段 | 对应问题 |
| --- | --- | --- | --- |
| `GET /homestay/bookings/:id`、`GET /homestay/stays/:stayId` | booking 只有 `unitId` | `unitCode`, `unitName`；确需跨楼栋/园区辨识时再加 `buildingName`, `parkName` | HCD-011 |
| `GET /housing/tasks`（并建议同步 `/homestay/tasks` 结构） | 只有 `assigneeId` | `assigneeName`；可选结构化 `unitCode/unitName`，避免继续从 title 解析 | HCD-020 |
| `GET /housing/purchases`、`GET /housing/purchases/:id` | 采购只有 `unitId` | `unitCode`, `unitName` | HCD-027 |

### 5.2 不建议无差别补字段

- 当前 tenant/park scope 已明确的页面，不因“可能有用”就给所有响应增加 `parkName/buildingName`。只有用户需要跨园区/楼栋辨识且页面确有展示位时再补。
- homestay finance 当前以订单为主体；如产品决定财务列表必须显示房源，应在 finance projection 直接补 `unitCode/unitName`，不要让 Web 通过 booking/unit API 做 N+1 拼接。此项是待复核的改动面，不计入上述 3 个已确认 B 类问题。
- 关联名称使用 query projection/join 返回，不把展示名称冗余持久化到交易实体；历史快照确有审计要求时另行设计。

## 6. 既有映射资产与统一修复方案

### 6.1 可复用资产

| 资产 | 位置 | 现状 |
| --- | --- | --- |
| 领域枚举值 | `packages/shared/src/index.ts:339-447` | operating、homestay booking/turnover/ledger、housing lease/ledger 已有权威值域，但缺 label |
| 房态 presentation | `apps/web/app/homestay/_components/homestay-workbench.logic.ts:24-43` | 完整、含 variant 和未知兜底，可保留为 Web presentation |
| 房产控制面 labels | `apps/web/components/property/PropertyFoundationControlClient.tsx:137-183` | operating/occupancy/approval/source 较完整，但被锁在单页私有常量 |
| Housing 局部 options | `apps/web/app/housing/_components/HousingSurfacePrimitives.ts:3-8` | 可复用意图正确，但已与 shared lease 值域漂移 |
| 通用运行时字典 | `apps/web/lib/dict-client.ts:5-30` | 可加载 `/dict-items` 的 `itemValue → itemLabel` |
| 通用状态组件 | `packages/ui/src/components/StatusPill/StatusPill.tsx:12-41` | 支持 `dictCode/dicts`；未传字典时原值直出 |

### 6.2 建议的映射层

1. `packages/shared` 负责封闭、稳定、跨 API/Web 的领域枚举值与中文 label：operating mode/status、homestay booking/turnover/ledger、housing lease/handover/occupant role、repair priority/urgency、purchase approval/payment、approval decision/execution、workbench task source/status。导出 typed `Record<Enum, string>` 或 `{value,label}` 列表，筛选和展示由同一源生成。
2. `apps/web` 负责 UI presentation：`StatusPill` variant、组合文案、未知值策略、React option。建议落在 `apps/web/features/property-shared/presentation/`；homestay/housing route-local 只消费，不再私建状态数组。
3. 可由租户配置的开放值（如费用类型、支付方式）走既有 `/dict-items` 与 `loadDictMapByCodes()`；不要硬编码一份不完整静态表，也不要先查字典类型管理端点。
4. 关联实体统一回退顺序：`displayName/unitName` → 合法业务编号（如 `unitCode/leaseCode`）→ “未命名/未关联/不可用”；UUID 仅在受控技术信息或审计面显示，并明确标注“内部 ID”。
5. 未知枚举不要静默原样作为主标签：生产 UI 显示“未知状态/待配置”，同时保留原码用于日志、遥测或折叠技术信息。

### 6.3 分批实施建议（复核批准后另开队列）

- 批次 1：shared label 单一来源 + Web presentation helper，先修 19 个 C 类并补值域一致性测试。
- 批次 2：3 个 API 名称 projection + shared response contract + Web 消费；保持列表/详情字段权限一致。
- 批次 3：2 个 A 类回退修正与 picker URL 恢复。
- 批次 4：产品确认 6 个 D 类目录后实施；开放字典与固定枚举分开。

本报告不创建实施 Issue；以上分批仅是复核后的建议队列形状。

## 7. D 类需产品定名清单

| 目录 | 已观察值/范围 | 待定事项 |
| --- | --- | --- |
| 民宿住客核验/凭证 | `unverified/verified/rejected`；`issued/returned/lost/void` | 中文名称、颜色语义、终态定义 |
| 民宿流水状态/审计 action | 流水状态及 booking/stay action 开放字符串 | action 中文动词、before/after 所属状态域 |
| Party 核验/同意 | `verificationStatus`、`consentStatus`、fact status | “已核验/核验通过”等术语统一；撤回/失效/拒绝语义 |
| 费用类型/支付方式 | 已观察 `rent/deposit/electricity/checkout_charges/checkout_deduction/purchase_recharge`，但非封闭全集 | 平台固定值 vs 租户可配置字典；中文名与历史兼容 |
| Party 角色/来源/provenance | `roleType/sourceType/status/operator_recorded/...` | 普通业务面与审计面的展示粒度 |
| Identity/notification/incident/retention | submission、通知已读、事件状态、failure side、`restrict_processing/retain_restricted/pending_legal_review` | 法务术语、状态生命周期、哪些值允许普通住房岗位看到 |

注意：`operating_mode` 不列 D 类，因为仓库已有“不经营/民宿短租/长租经营”的明确资产；`expiring/terminated` 虽漏标签，但租约状态域已封闭，归 C 类等待研发复核具体措辞。

## 8. 改动面评估

预计后续实施会涉及：

- `packages/shared`：1–3 个枚举/label/response-contract 文件及对应测试。
- `apps/web`：1 个 property-shared presentation 目录，民宿约 6–8 个组件，housing 约 8–11 个组件，Party/identity 兼容展示约 2 个组件；同时更新相关组件/逻辑测试。
- `apps/api`：homestay booking query、property workbench task projection、housing purchase query/response projection，约 3–6 个 service/contract/test 文件。
- 数据库：当前没有必要新增字段或 migration；建议全部通过查询 projection 与共享映射解决。
- 风险：中等。风险主要是值域漂移（`closed` vs `terminated`、漏 `expiring/no_show`）、字段权限下名称投影泄漏，以及移动卡片和桌面表格分支不一致。

## 9. 验证方案

### 9.1 静态与单元验证

- shared：每个封闭枚举必须被 label map 穷尽覆盖；禁止额外键；`HOUSING_LEASE_STATUSES` 与筛选选项集合完全相等。
- Web：针对每个 HCD 编号增加/更新 component/source contract 测试，断言已知码值不直接出现在用户可见文本；未知值走统一兜底。
- API：列表与详情 response contract 测试断言 `unitCode/unitName/assigneeName`；同时验证字段权限与 null 回退。
- 全仓搜索：检查 `StatusPill value={item.status}`、`render: (item) => item.status/sourceType/*Id` 等残留，但逐条人工判定审计 ID 是否合理。
- 运行相关 lint、typecheck、unit tests；shared 变化后同时验证 API/Web build。

### 9.2 页面验收

每个 canonical surface 与详情至少覆盖：正常值、null、未知值、权限裁剪、API 错误、URL 恢复 picker。桌面与 390px 手机宽度均检查：

- 页面无横向溢出；移动卡片与桌面表格显示同一中文 label。
- 长中文状态不挤压主操作，不被省略成不可辨识码值。
- picker 选中、刷新、返回后仍显示名称；不可用实体显示中文占位，不显示 UUID。
- 关联实体名称缺失、已删除或权限不可见时不泄漏内部 ID。
- 错误主文案中文；request id/原码只在次要技术信息中出现。

### 9.3 回归边界

- 不改变 API 状态值、数据库存储值、筛选 query 值或审批/财务业务语义；只改变展示 label 与名称 projection。
- 不把 Web label 反向提交到 API。
- 不将 HR 系列纳入共享状态整理。

## 10. 本轮边界与后续门禁

- 本轮只交付调查报告和 Trellis investigation 记录，未改任何产品代码、配置、migration、seed、测试或生产环境。
- 不开实施 Issue。须由用户/产品/研发复核问题矩阵、D 类定名和 API 字段范围后，再单独创建修复队列。
- 报告中的“建议修法”不是实施批准。
