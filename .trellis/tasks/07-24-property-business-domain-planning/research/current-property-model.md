# 当前房产经营模型研究

## 研究范围

本文件记录 2026-07-24 对当前仓库资产、房源、招商租赁、财务、能源、工单、菜单与交付文档的只读调查结果，作为后续领域蓝图和 MVP 规划依据。

## 已确认的系统事实

### 1. 当前存在物理资产与可出租房源双层模型

仓库中存在两套并行表族：

- `asset_park`、`asset_building`、`asset_floor`、`asset_unit`：物理资产结构，由 `/assets/*` 管理。
- `biz_park`、`biz_building`、`biz_floor`、`biz_unit`：园区经营和可出租业务房源，由 parks/buildings/floors/units 模块管理。

现有专项文档明确将前者定义为物理资产结构，后者定义为可出租业务房源。后续不能再为长租或短租建立第三套孤立的园区、楼栋、楼层、房源主数据。

### 2. `biz_unit` 是当前租赁经营链路的房源锚点

`biz_unit` 已包含：

- 园区、楼栋、楼层关联
- 房源编码和名称
- 用途类型
- 建筑/使用面积
- 出租状态
- 装修状态
- 参考价格
- 照片和平面图
- 可用日期
- 锁定原因和锁定过期时间
- 状态流转日志

租赁合同房源关系 `rel_leasing_contract_unit.unit_id` 外键直接引用 `biz_unit(id)`，并保存合同期内的房源编码、名称、面积、单价、月租、开始日期和结束日期快照。

### 3. 当前长期租赁主要面向企业租户

现有 `biz_park_tenant` 以企业为中心，包含：

- 企业名称、统一社会信用代码、法人
- 联系人、手机号、邮箱
- 行业、经营范围、风险等级
- 入驻和退出日期

`biz_leasing_contract.park_tenant_id` 关联企业租户。个人住房租客不能无约束地直接塞入企业租户表；需要抽象统一交易相对方，或建立住宅租客领域并通过兼容层复用合同和财务能力。

### 4. 现有长期租赁闭环可复用程度较高

当前已有：

- 招商线索、跟进、看访、报价、公海池和漏斗
- 合同草稿、审批、生效、续租、变更、作废和状态日志
- 合同与房源关联及期间冲突检查基础
- 应收生成、账龄、收款、核销、减免、发票
- 退租结算与退款登记
- 文件归档、审计、权限、数据范围与幂等保护

住房出租 MVP 应优先复用这些领域服务，但需要补充个人租客、同住人、住宅租约条款、押金台账、交割清单和住宅费用项目。

### 5. 能源与工单可以作为共享支撑能力

能源模块已有表计、读数、账期、账单明细、公共能耗分摊、调整和红冲能力；可以为住宅水电费和民宿能耗分析提供基础，但分摊口径仍需单独设计。

工单模块已有分类、优先级、指派、状态流转、SLA 和日志，可复用于租客报修、民宿维修、保洁异常，但民宿“保洁周转任务”需要与普通维修工单区分任务类型和时限。

### 6. 短租缺少按日库存与预订领域

现有房源只有静态出租状态、可用日期和临时锁定字段，无法表达：

- 某房型在指定日期的可售库存
- 连住跨日占用
- 预订锁房和锁定过期
- 改期、换房、取消后的库存回补
- 维修占房、保洁占房和超卖控制
- 每日价格和渠道价格

因此民宿必须新增独立的短租库存、价格、预订和入住领域；不能用 `biz_unit.rental_status` 代替按日房态。

### 7. 当前范围与环境文档存在历史口径漂移

根 README 和大量 release 文档仍使用：

- 首发范围
- 二期范围
- 暂缓开放
- 生产开放
- production gate

用户已确认：

- 已设计开发功能均属于计划上线范围。
- 当前最高环境是 UAT，尚未真实投入生产。

后续应保留历史发布报告作为证据，但在权威入口新增当前范围和环境声明，避免重写所有历史记录或篡改当时结论。

## 初步领域结论

### 推荐的共享层

- SaaS 租户、组织、用户、角色、权限、数据范围
- 物理资产结构
- 可经营空间/房源主数据
- 文件、附件、审计
- 财务应收、实收、退款、发票基础能力
- 工单、能源、通知和统计基础能力

### 推荐隔离的业务域

- 园区招商租赁：企业客户、招商线索、商业合同。
- 住房长期出租：个人/家庭租客、住宅租约、同住人、交割和周期账单。
- 民宿短期经营：房型、每日价格、库存、预订、入住、退房和周转保洁。

### 需要在蓝图中解决的历史问题

- `asset_*` 与 `biz_*` 的权威边界和映射规则。
- 企业租户与个人租客是否抽象统一交易相对方。
- 长租租约是否复用现有合同内核，还是建立住宅租约外层。
- 财务能力复用到何种粒度，避免把商业租赁字段强加给短租订单。
- 长租与短租对同一经营房源的排他占用规则。

## 参考证据

- `docs/agents/agent-1-assets-space-plan.md`
- `docs/agents/agent-2-leasing-finance-plan.md`
- `apps/api/src/modules/units/entities/unit.entity.ts`
- `apps/api/src/modules/assets/entities/asset-unit.entity.ts`
- `apps/api/src/modules/leasing-contracts/entities/leasing-contract-unit.entity.ts`
- `apps/api/src/modules/park-tenants/entities/park-tenant.entity.ts`
- `apps/api/src/modules/energy/entities/`
- `apps/api/src/modules/work-orders/entities/`
- `apps/web/lib/menu.ts`
- `database/migrations/000007_s2_assets_foundation.sql`
- `database/migrations/000011_s2_biz_unit.sql`
- `database/migrations/000012_s2b_unit_enhancement.sql`
- `database/migrations/000045_s3c_contract_unit_links.sql`
