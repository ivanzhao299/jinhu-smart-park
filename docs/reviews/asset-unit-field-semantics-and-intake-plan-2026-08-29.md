# 资产单元字段语义与民宿/长租房源接入方案核查

- 日期：2026-08-29
- 基线：`origin/main` `815350e8febd474ca0d3b93a9542239b747d4e70`
- 性质：只读 investigation；本文不批准、也不实施任何产品代码、迁移或生产变更

## 1. 结论先行

1. 系统有两套“单元”模型：`asset_unit` 是物理资产空间，`biz_unit` 是业务经营房源。运营房源台账、状态板、统计、住房和民宿 picker 消费的是 `biz_unit`；物理资产页面主要提供 `asset_unit` 到经营空间的转换/映射入口。物理资产用途是字符串 `asset_unit.usage_type`（默认 `office`），经营房源用途是数字字典 `biz_unit.usage_type`，二者不能混同。
2. 当前真实经营模式枚举是 `none | short_stay | long_rent`，不是 `homestay`；经营状态是 `enabled | suspended | disabled`。同一房源只有一条未删除经营配置和一个 mode，因此民宿与长租在配置层互斥。
3. 当前住房长租资格不是“mode 单独驱动”，而是复合条件：`biz_unit.status=1`、`usage_type=70（住房）`、`long_rent/enabled`、租户/园区/数据权限；最终写入还按租期复核 occupancy、商业合同和未完成民宿周转任务。
4. 民宿候选只要求房源启用、未删除、`short_stay/enabled` 和数据权限；运行时代码不检查用途或出租状态。因此办公室用途若已成功切到 `short_stay/enabled`，当前代码可进入民宿候选。
5. 办公用途（10）当前不能进入“住房出租”长租候选；它现有的出租路径是商业租赁，商业合同反而明确排除住房用途（70）。新需求暴露的是领域划分问题：当前 `long_rent` 被住房用途封闭，而“办公出租”被放在商业租赁链。
6. `rental_status` 是经营房源台账/看板状态。商业合同生效、商业退租与它联动；住房租约和民宿不写它。它与 operation mode 没有统一驱动关系，存在“长租/短租已经营但仍显示可招商”等跨域漂移可能。
7. Git 证据不支持“先用用途=住房作为民宿/住房资格，后被 mode 取代”的严格时间线。可证实的是：2026-07-24/25 先设计并交付 mode 驱动共享底座；2026-08-19 才把用途 70 加入住房 control-plane、住房/公寓边界和存量迁移保护。当前不是“用途失效”，而是用途与 mode 叠加且职责纠缠。
8. 推荐采用“**A 为主、B 的分类能力为辅**”：mode/审批链继续决定经营资格；用途保持客观空间属性，并以允许用途集合约束明显不合规的业务，长租允许 `住房(70)+办公(10)`；picker 返回用途以支持住宅长租/办公长租展示和统计。不要采用 C 回退为用途驱动资格。

## 2. 模型与字段现状

### 2.1 `asset_unit`：物理资产单元

实体见 `apps/api/src/modules/assets/entities/asset-unit.entity.ts:7`，建表见 `database/migrations/000007_s1_asset_management.sql:62`。该模型由资产楼栋/楼层组织，尚无物理单元专属 Web CRUD；Web 主要在“转为运营空间”抽屉读取它。

| 业务字段 | DB 列与现有值/约束 | API/shared | Web 消费 |
|---|---|---|---|
| 标识与层级 | `id`、`asset_park_id`、`building_id`、`floor_id`，均为 UUID/FK；`unit_code`、`unit_name`、`unit_no` | create/update DTO 校验 UUID、长度；scope/父级由服务核验 | 经营空间候选展示楼栋、楼层、编号 |
| 物理用途 | `usage_type varchar(32) NOT NULL DEFAULT 'office'` | DTO 仅 `string`、max 32，无共享枚举或 `IsIn` | 未发现编辑/统计；不能直接当作 `biz_unit` 用途 |
| 面积 | `building_area numeric(14,2)`、`rentable_area numeric(14,2)`，默认 0 | DTO `Min(0)` | 转换抽屉展示；可租面积默认映射为 `biz_unit.use_area` |
| 朝向 | `orientation varchar(32)` nullable | 可选字符串 | 未发现运行时 Web 消费 |
| 物理租赁状态 | `lease_status varchar(32)`，默认 `vacant`；DTO：`vacant/reserved/leased/disabled` | API 本地枚举，shared 无合同 | 状态板不读它；未发现 Web 消费 |
| 物理启停 | `status varchar(32)`，默认 `enabled`；DTO：`enabled/disabled` | API 本地枚举 | 仅通用资产组件具有同类状态控件，未找到物理 unit 页面配置 |
| 审计/备注 | `remark` 与通用 create/update/delete/version 字段 | `AuditableEntity` | 无专属展示 |

物理到经营映射由 `biz_unit.asset_unit_id`、父级映射和不可变审计承接，见 `database/migrations/000218_asset_operating_space_mapping.sql:19`、`:82`。转换时用途、出租状态、装修状态由转换 DTO 重新提供，不从物理 `usage_type='office'` 自动翻译；当前 Web 转换抽屉固定提交 `办公(10)/可招商(10)/毛坯(10)`，并非由用户逐项选择，见 `apps/api/src/modules/assets/asset-space-mapping.service.ts:77` 与 `apps/web/app/assets/units/components/AssetSpaceConversionDrawer.tsx:35`。

### 2.2 `biz_unit`：经营房源/房号

实体见 `apps/api/src/modules/units/entities/unit.entity.ts:16`，建表见 `database/migrations/000011_s2_biz_unit.sql:3`。`/assets/units`、`/assets/unit-status-board` 和资产统计均使用此模型。

| 业务字段 | DB 列、类型、现有枚举/约束 | shared/API 合同 | Web 展示/编辑 |
|---|---|---|---|
| 编码/名称 | `unit_code varchar(64)`、`code varchar(64)`、`unit_name varchar(100)`；活动 scope 内编码唯一 | DTO 对 `unitCode` 有格式约束；`code` 为服务兼容字段 | 房源台账、详情、状态板 |
| 物理资产映射 | `asset_unit_id uuid` nullable，关联物理 `asset_unit`；同一活动物理单元最多映射一个经营单元，并受 tenant/park/父级链约束 | 不在普通 unit create/update DTO；由资产转换/经营控制面专用合同维护 | 转换抽屉与 Property Foundation 控制面消费 |
| 楼栋/楼层 | `building_id`、`floor_id` UUID/FK | DTO UUID；服务校验父子关系 | 表单级联、列表位置 |
| 用途 | `usage_type smallint NOT NULL` | shared：`10/20/30/40/50/60/70`；DTO create/update/query/export 统一校验 | 从 `unit_usage_type` 字典取标签；可编辑、筛选、列表/详情/统计展示 |
| 建筑/使用面积 | `unit_area numeric(14,2)`、`use_area numeric(14,2)` | DTO `Min(0)` | 表单、列表、详情、统计 |
| 出租状态 | `rental_status smallint NOT NULL` | API 当前允许 `10..70`；普通 update 禁止直接改，须走 `change-status` | 字典徽标、状态抽屉、日志、状态板、统计、商业租赁 picker |
| 装修状态 | `fitting_status smallint NOT NULL` | `10/20/30` | 字典选择与徽标 |
| 参考租金 | `ref_price numeric(14,2)` | DTO `Min(0)`；受字段权限控制 | 表单/详情/列表/统计 |
| 可租日期 | `available_date date` nullable | ISO date string | 表单、列表、详情 |
| 图片/平面图 | `photo_file_ids`、`photo_urls`、`floorplan_file_id`、`floorplan_url` | UUID/URL 数组与专用上传接口 | shared 上传/附件面板 |
| 锁定状态元数据 | `lock_reason`、`lock_expire_time`、`status_update_time/by` | `change-status` DTO 接收锁定原因/到期 | 详情、状态日志 |
| 房源启停 | `status smallint`，`0/1`，默认 1 | create/update DTO | 表单、详情；picker 普遍要求 1 |
| 审计/备注 | create/update/delete/version/remark | 服务字段策略 | 备注受字段权限控制 |

生产字典的确切语义位于 `database/seeds/000001_s1_production_core.sql:3409`：

- 用途：`10 办公`、`20 厂房`、`30 仓储`、`40 商业`、`50 展厅`、`60 会议室`、`70 住房`。
- 出租状态：`10 可招商`、`20 锁定`、`30 已出租`、`40 即将到期`、`50 维修中`、`60 自用`、`70 已售`。
- 装修状态：`10 毛坯`、`20 简装`、`30 精装`。

shared 只固化用途数值集合及 `UNIT_USAGE_HOUSING=70`，没有共享用途标签；标签由字典 API 提供。出租/装修枚举目前主要由 API DTO 本地数组和数据库字典共同维持，存在契约分散。上表将通用 create/update/delete/version、字段策略与附件关系归并展示；实体的完整列定义以 `apps/api/src/modules/units/entities/unit.entity.ts:16` 为准。

### 2.3 “单元状态”有三种，不应混称

| 名称 | 字段 | 语义 | 主要消费者 |
|---|---|---|---|
| 物理资产状态 | `asset_unit.status` 字符串 enabled/disabled | 物理源是否启用 | 资产 API/转换前置 |
| 经营房源启停 | `biz_unit.status` 数字 0/1 | 经营房源是否可用 | 所有候选链首要条件 |
| 出租状态 | `biz_unit.rental_status` 数字 10..70 | 台账招商/出租/维修/自用/已售状态 | `unit-status-board`、统计、商业租赁与人工状态流转 |

`unit-status-board` 消费的是出租状态，不是 operation mode，也不是 `asset_unit.lease_status`，见 `apps/api/src/modules/units/units.service.ts:997` 与 `apps/web/app/assets/unit-status-board/page.tsx:404`。

## 3. Property operation config 与状态机

### 3.1 数据合同

`biz_property_operation_config` 定义于 `database/migrations/000176_shared_property_foundation.sql:32`：

- mode：`none | short_stay | long_rent`；
- status：`enabled | suspended | disabled`；
- 其他字段：`effective_time`、`suspend_reason`、审计字段、`version`；
- 非 enabled 必须填写 `suspend_reason`；
- `(tenant_id, park_id, unit_id)` 未删除记录唯一，因此一个房源只有一个当前 mode。

尚未创建配置时，读取层投影为 `none/enabled/version=0`；真实新记录从 version 1 开始。`configure` 对经营配置字段只改 status/reason/remark，不改 mode，并以请求 version 做乐观并发校验；同一接口还可通过 `asset_unit_id` 维护物理资产关联/解除，见 `apps/api/src/modules/property-operations/property-operations.service.ts:227`、`:237`、`:260`。

### 3.2 模式切换

mode 必须经 `POST /property/units/:unitId/mode-transitions`，不能从 configure 直接修改。当前流程是：

1. 校验权限和房源访问，锁 `(tenant, park, unit)` 与配置；非启用房源不能转入非 none。
2. 采集占用、商业合同、住房租约、民宿预订/退房周转、工单、未结应收等 blocker snapshot。
3. 创建 source=`property-operation-config`、绑定 config id/version、目标 mode 与 snapshot hash 的待审批请求。
4. 审批阶段执行 request/stage version CAS、策略 hash、职责分离和权限校验。
5. 只有 decision=`approved` 且 `approval.enforce` runtime control 有效时 executor 可 claim；adapter 再锁配置并复核 source version、当前 mode/status、实时 blocker snapshot。
6. CAS 更新 `operating_mode`、`version+1`，写不可变 transition log、effect proof/receipt/outbox；reconcile 同时验证日志、目标 mode 和版本。

相关核心代码：`apps/api/src/modules/property-operations/property-operations.service.ts:299`、`:385`、`:970`，审批执行器见 `apps/api/src/modules/property-approvals/property-approval.service.ts:1045`、`:1205`。

### 3.3 enabled/disabled 与 runtime control 不是一回事

- operation status 表示某房源的经营配置是否可用：`enabled/suspended/disabled`。
- approval runtime control 是租户/园区级执行能力，DB mode 为 `disabled/observe/shadow/enforce`；应用当前识别 `approval.shadow-compare`、`approval.enforce`、`event-notification.enforce`。缺失、漂移或非 enforce 均 fail closed。
- PR #414 只增加隔离、非生产的审计化 UAT enable 入口；没有改变生产默认、mode 枚举或业务资格。

## 4. 当前用途消费与资格链

### 4.1 用途不是纯描述字段

当前运行时用途消费者包括：

- 房源 create/update/query/export 和资产统计；
- 房源台账表单、筛选、列表、详情与统计；状态板展示用途但不能按用途过滤；
- property control-plane 仅允许用途 70；
- 住房候选与最终租约资格强制用途 70；
- apartment 候选/创建强制用途 70；
- 商业租赁合同禁止用途 70，Web 合同/线索 picker 过滤掉 70；
- 用途从住房改为其他时，如存在经营配置、占用或业务活动则阻断；其他用途改住房时，如存在未结束商业合同则阻断，见 `apps/api/src/modules/units/units.service.ts:363`。

因此它兼具客观属性、领域路由、资格门槛、迁移分群和跨业务互斥五种职责，绝非纯展示字段。

### 4.2 民宿候选

`apps/api/src/modules/homestay/homestay.service.ts:119` 的过滤全集：

- tenant/park scope；
- `biz_unit.status=1`、未删除；
- operation 未删除、`short_stay/enabled`；
- actor 可访问 unit scope；
- 分页。

没有用途、出租状态、装修状态或实时 occupancy 条件。创建 booking 时会在事务内锁房源，复核启用、`short_stay/enabled` 和未完成 turnover；日期占用由后续 booking/occupancy 规则处理。办公室用途当前可被配置为民宿的事实，是代码现状，不代表产品应允许。

### 4.3 住房长租候选

`apps/api/src/modules/housing/housing.service.ts:138` 与 `housing-lease-unit-eligibility.ts:11` 的过滤全集：

- tenant/park scope；
- `biz_unit.status=1`、未删除；
- `biz_unit.usage_type=70`；
- operation 未删除、`long_rent/enabled`；
- actor 可访问 unit scope；
- 可选 keyword、排序和分页。

候选列表不检查租期冲突，也不返回 ineligible reasons。创建、提交、审批、签署均在事务链重新执行资格校验；提供租期时检查有效/未过期 held occupancy、有效商业合同关系和未完成民宿 turnover。H-FOUNDATION-03 的“long_rent/enabled 进候选”成立但不完整，还必须是启用的住房用途房源。

### 4.4 互斥

- 配置层：唯一配置 + mode 单值，不能同时 `short_stay` 和 `long_rent`。
- 业务层：统一 occupancy、商业合同、住房租约、民宿周转等 blocker 阻止带活动记录切 mode。
- 最终写入：住房按租期复核冲突；民宿创建 held occupancy，进一步阻止并发长租。

### 4.5 出租状态与 mode

出租状态的明确写入者是：人工 `change-status`、商业合同生效（写 30 已出租）、商业退租释放、导入/种子。住房与民宿运行时源码均不读写 `rental_status`；它们依赖 operation config 与统一 occupancy。

所以二者是平行投影，没有“谁驱动谁”的统一规则：

- mode 表示批准的经营方式和启停；
- occupancy/租约/预订表示具体时间段内的占用事实；
- rental status 表示资产台账的招商/租用/维修/处置状态，目前只被商业租赁部分自动维护。

这会造成潜在冲突：房源可为 `long_rent/enabled` 但出租状态“已售/自用/维修中”，住房候选仍可能出现；民宿/住房实际在营或已租时，状态板仍可能显示“可招商”。当前代码没有系统性收敛机制。

## 5. 演进史：“怎么失效的”

以下只陈述可验证事实。没有找到可证实的“最初用途=住房标记民宿和住房房源”引入 PR/commit；若该意图只存在于早期口头讨论，Git 无法为它补证。

| 日期 | 证据 | 可证实变更 |
|---|---|---|
| 2026-07-24 | commit `8d456526`，归档任务 `07-24-shared-property-foundation` | 蓝图已定义 `none/short_stay/long_rent`，同房源长短租可切换但不可同时经营；未发现用途资格条件。 |
| 2026-07-25 至 07-30 | commit `23b5afe6`，PR [#192](https://github.com/ivanzhao299/jinhu-smart-park/pull/192)，merge `f57523f6` | 交付共享经营配置、统一占用、民宿/住房 MVP；mode 成为共享底座。该版本尚无当前用途 70 资格链。 |
| 2026-08-12 | commit `c9fa3ef4`，Issue #251 | 增加住房独立候选/资格策略，明确 active + `long_rent/enabled` + scope。报告核验到的 2026-08-19 commit `49f8baa8` 才明确新增 `UNIT_USAGE_HOUSING=70` 并把 control-plane 收窄到住房用途。 |
| 2026-08-19 15:49 | commit `49f8baa8` | 首次明确增加 `UNIT_USAGE_HOUSING=70`，control-plane 限住房用途，并新增住房用途字典/回填迁移。用途从此进入业务边界。 |
| 2026-08-19 16:02 | commit `e7965618` | apartment 候选/创建限制住房；用途切换增加经营活动与商业合同保护。 |
| 2026-08-19 17:25 | commit `59f63593` | 加固住房用途历史回填；仅 short-stay config 作为回填证据之一，说明用途迁移与 mode 仍是不同维度。 |
| 2026-08-19 18:23 | commit `8be29834` | 住房用途禁止绑定商业租赁，进一步承担住宅/商业边界。 |
| 2026-08-20 | PR [#331](https://github.com/ivanzhao299/jinhu-smart-park/pull/331) | 民宿核查战役闭环。同期 UAT 文档明确用途 70 是通用 fixture，不是民宿独占资格；民宿权威资格是 `short_stay/enabled` 等。 |
| 2026-08-20 | Issue #336、PR [#337](https://github.com/ivanzhao299/jinhu-smart-park/pull/337) | 住房核查战役补 picker、分页、权限、审批与 UAT；没有把 mode 改为仅启停。 |
| 2026-08-26 | PR [#408](https://github.com/ivanzhao299/jinhu-smart-park/pull/408)，commit `10feefb6` | 修复批准后 executor 的 PostgreSQL 参数类型问题，使 `none→long_rent` 能实际落库；与用途字段无关。 |
| 2026-08-26 | PR [#414](https://github.com/ivanzhao299/jinhu-smart-park/pull/414)，commit `27de6069` | 增加隔离、非生产、可审计的 approval runtime UAT enable 入口；不改变生产默认或资格语义。 |

准确回答“怎么失效的”：**没有证据表明用途方案先被引入又被 mode 替换。mode 更早成为经营资格底座；用途 70 后来叠加为住房/公寓/control-plane 的领域边界。用户原计划若是“用途单独决定民宿/长租资格”，它从未成为当前代码的唯一权威，并在民宿链完全未落地、在长租链只落成附加门槛。**

当前残留包括 `UNIT_USAGE_HOUSING`、住房 picker/eligibility、property control-plane 限制、apartment 限制、用途切换保护、商业租赁排除规则和历史回填迁移；这些都证明用途仍有强业务作用。

## 6. 新需求差距

### 6.1 长租支持办公室

当前阻断点不只在 picker：

1. shared 只有 `UNIT_USAGE_HOUSING` 这个命名化用途常量，办公仅为裸值 10；
2. property control-plane 本身拒绝非 70，办公室无法通过标准入口配置 `long_rent`；
3. 住房 picker 和最终 eligibility 均强制 70，并返回 `UNIT_USAGE_NOT_HOUSING`；
4. 住房页面、错误、权限、菜单、模块和文档大量使用“住房/住房房源/住宅租约”；
5. 用途迁移和切换保护按“住房 vs 商业合同”二分；
6. 办公目前被商业租赁合同链接纳。若又纳入 housing 长租，必须决定两条合同域如何分工，不能仅放开一个 SQL 条件。

### 6.2 民宿边界

当前代码允许任何用途进入 short-stay，只要 mode 审批通过。若产品要求民宿仅限住宅，则缺少 control-plane、transition、picker、最终写入一致的用途约束；只在 picker 前端过滤不安全。

### 6.3 用途与 mode 职责

建议语义：

- 用途回答“这个空间在资产/规划上是什么”：办公、厂房、仓储、商业、展厅、会议室、住房；
- mode 回答“经审批后当前以何种方式经营”：none、短住、长租；
- operation status 回答“该经营配置现在是否启用”；
- occupancy/合同/预订回答“谁在什么时间占用”；
- rental status 回答“资产台账对外招商/租用/维修/处置状态”，应明确是派生还是可人工维护。

现状的问题不是字段太少，而是领域准入规则和文案把“长租经营”收窄成“住房出租”。

## 7. 方案比较

### A. Mode 驱动资格，用途作为属性（现状深化）

| 维度 | 方案 |
|---|---|
| 数据模型/迁移 | mode 表无需变；用途字典可保持现值。需修正历史数据时只做受审计的数据清理，不以迁移自动把办公改住房。 |
| shared 双端 | 增加办公等命名常量或共享 `UnitUsageType` 元数据；资格原因从 `NOT_HOUSING` 改为业务中性。 |
| picker 合同 | 长租只看 active + `long_rent/enabled` + scope；用途作为返回字段/筛选 facet，不作拒绝。最终写入保持同一权威规则。 |
| UI/文案 | “住房出租”改为“长租经营/出租经营”；展示“住宅长租/办公长租”标签。 |
| 审批链 | 完整复用现有 mode transition、blocker、executor、version 和 runtime control。 |
| 风险 | 任何用途理论上都可长租/短住，若没有 allowlist 会误配厂房/仓储；现有商业租赁与长租合同域边界仍需决定。 |
| 验证 | mode transition、candidate/write 同规则；办公/住房正例，厂房等按产品决定；并发/version、occupancy/商业合同互斥回归。 |

优点是模型清晰、改动相对小；缺点是“用途纯属性”若字面执行到完全不约束，会削弱合规防线。

### B. Mode + 用途双条件，并按用途分流

| 维度 | 方案 |
|---|---|
| 数据模型/迁移 | 不必新增列；可定义 long-rent allowlist=`住房/办公`、short-stay allowlist 待定。存量 config 做只读审计，冲突数据人工处置。 |
| shared 双端 | 共享命名用途常量、业务 allowlist/资格 reason；API/Web 使用同一合同，避免裸值和本地复制。 |
| picker 合同 | 长租候选要求 mode/status + 用途在 allowlist，并返回 `usage_type/name`、`rental_segment=residential/office` 或由前端按共享用途映射展示；支持 facet。 |
| UI/文案 | 模块总称“长租经营”；表单/列表分“住宅长租、办公长租”；保留通用租约流程的前提是字段真的适用于两类租赁。 |
| 审批链 | transition 前与 executor 重放时均校验目标 mode 的用途 allowlist；用途变更也要在同一 unit lock 下验证现有 mode/活动。 |
| 风险 | 用途与 mode 继续形成耦合；allowlist 变化涉及 shared/API/Web/迁移/文档同步；住宅与办公合同字段差异可能迫使业务子类型化。 |
| 验证 | 每个 mode×用途矩阵、picker 与 final-write 一致性、用途变更、存量审计、统计分流、移动/桌面文案。 |

这是对现状最自然的修正：承认用途是属性，但也用它做明确、可解释的合规准入。

### C. 用途驱动资格，mode 仅管启停

| 维度 | 方案 |
|---|---|
| 数据模型/迁移 | 要么移除 mode 区分，要么把 mode 降格为与 status 重叠的字段；需要重写配置、transition log、审批 payload/effect、历史数据语义。 |
| shared 双端 | mode 合同、资格 reason、occupancy compatibility、审批 action 全面变更。 |
| picker 合同 | 按用途直接路由；“住房同时可民宿和长租”无法仅靠用途决定，仍需另一个经营选择字段，最终会重新发明 mode。 |
| UI/文案 | 用途编辑将变成高风险业务切换；普通房源表单不能再当属性编辑。 |
| 审批链 | 现有 source version、from/to mode、blocker snapshot、executor proof 与 transition audit 需重构或废弃。 |
| 风险 | 与 PR #192 以来的共享底座、统一 occupancy、#408/#414 executor/runtime 证据链冲突最大；历史审计含义易破坏。 |
| 验证 | 全量 property/homestay/housing/apartment/commercial leasing 回归、迁移重放、审批 reconciliation、生产兼容。 |

不推荐。用途无法表达同一住宅在 none、民宿、长租间的受控切换；把 mode 仅作启停又与 operation status 重复。

### 推荐组合：A 的职责边界 + B 的联合准入矩阵

建议保留单值 mode，作为经营模式唯一的审批切换对象；最终资格由 `mode/status + 用途 allowlist + 房源/占用状态` 联合决定。用途保持空间属性，但不是“完全不参与业务”的纯展示，而是 target mode 的 allowlist 与分类维度：

- `long_rent`：允许住房 70 + 办公 10；
- `short_stay`：是否仅住房 70，等待产品决策；
- 其他用途默认不允许进入二者，除非后续明确扩展；
- picker 和最终写入共享同一后端资格投影，返回用途及 machine-readable reasons；
- 产品总称改“长租经营”，以用途分“住宅长租/办公长租”；
- 不把办公单元为了长租强行改成住房，避免资产属性失真；
- 现有商业租赁与新办公长租必须先定义合同域边界。

这比纯 A 多一层安全准入，但不牺牲现有 mode 审批、互斥、审计和 executor 体系。

## 8. 需要用户/产品决策

以下决策在任何实施前必须明确：

1. **模块总称**：是否将“住房出租”统一改为“长租经营”（推荐：是），权限码/API 路径是否保留兼容旧名。
2. **办公租赁归属**：办公单元的长租应进入 housing_rental 的通用长租租约，还是继续使用 commercial leasing？推荐先按合同对象与计费模型划界：个人/标准化长期居住走住宅长租，企业办公及商业条款走商业租赁；若确需同一工作台，再抽象共同租赁合同而非让两域重复接管同一房源。
3. **长租用途 allowlist**：是否明确为住房 70 + 办公 10（推荐：是）；商业 40、厂房、仓储等是否继续只走商业租赁。
4. **民宿用途 allowlist**：是否仅住房 70（推荐：默认仅住房，除非业务能证明办公/商业空间合法短住）；当前代码没有该限制。
5. **用途名称**：字典“办公”是否改为“办公室”，或保留值 10 仅调整显示；推荐保留数值和值语义，产品统一显示名称后再决定是否迁移标签。
6. **住宅/办公长租分型**：仅按用途动态展示，还是在租约上持久化 `rental_segment`；推荐 MVP 先由权威用途派生，只有合同字段/流程真正分叉时再持久化子类型。
7. **用途变更权限与审批**：有 mode/config/occupancy/合同历史的单元能否改用途；推荐继续强保护，并为跨类别变化设置独立审批与审计，不能通过普通编辑绕过。
8. **出租状态权威**：它是人工资产台账状态，还是由所有租约/预订/occupancy 派生；推荐明确“人工经营可用性 + 系统占用投影”的双层模型，避免一个七值字段同时表达资产处置和实时入住。若短期不重构，至少定义住房/民宿是否自动同步 30/10 及冲突优先级。
9. **存量冲突处置**：现有非住房 `short_stay/long_rent`、住房商业合同、operation mode 与 rental status 矛盾数据，是阻断迁移、只报告，还是审批纠正；推荐先只读审计、逐条产品确认，不自动改用途或 mode。
10. **picker 体验**：是否展示全部候选并给出不可选原因，还是只返回 eligible；推荐返回稳定 `eligible/ineligible_reasons` 和用途 facet，最终写入继续事务内复核。

## 9. 后续实施影响与验证清单（待批准，本文不实施）

若采用推荐组合，后续任务至少应覆盖：

- 数据/迁移：只读存量审计 SQL；必要迁移必须 forward-only、冲突 fail closed，不改既有成功迁移。
- shared：命名用途常量、mode×用途准入合同、通用资格 reason、picker projection。
- API：property control-plane、transition/executor 重放、housing candidate/final eligibility、homestay candidate/final eligibility、用途变更保护、商业租赁边界。
- Web：模块标题、菜单/权限显示名、picker 标签/facet/reasons、详情错误和统计分类；桌面与 390px 验证。
- 测试：mode×usage 全矩阵，候选与最终写入同策略，并发/version、审批/runtime、occupancy/合同冲突、用途变更与历史数据回归。
- 文档/UAT：共享房产底座、住房/民宿 UAT、产品范围、权限与发布验证同步。

## 10. 证据边界与已知风险

- 本报告以基线 commit 的静态代码、迁移、测试、文档和 GitHub PR 元数据为准；未连接生产数据库，也未操作任何生产、容器或浏览器。
- 历史中没有可验证的“用途=住房原始方案”PR，因此报告没有为该口头意图伪造来源。
- migration 文件编号在历史中有重命名/顺延，当前主干文件为 `000220_unit_usage_housing.sql`，历史 commit 中曾为 `000217_unit_usage_housing.sql`；引用 commit 时应以当时路径理解。
- picker 候选与最终资格并非完全同投影：住房候选不做租期冲突，民宿候选不做周转复核。这属于现状风险，不等于本调查批准修复。
- “办公长租”若仍由商业租赁覆盖，新需求可能只需产品命名/导航整合而非把办公放入 housing；必须先完成决策点 2。
