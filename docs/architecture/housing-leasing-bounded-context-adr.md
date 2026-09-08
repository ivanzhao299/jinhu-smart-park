# ADR D-04：Housing 与 Traditional Leasing 长租边界

- 状态：Adopted
- 决策日期：2026-09-08
- 适用范围：property control plane、housing、traditional leasing
- 取代方式：只有满足本文全部触发条件并通过新的 ADR 与迁移发布评审，才能取代本决策

## 1. 背景

系统以 `long_rent` 表达长租经营模式，但存在两个具有不同业务语言、主体、状态机和财务审计链的实现：

- housing 面向个人、家庭和小团队，拥有住房租约、住户、费用计划、住房应收/ledger、交割、报修与购置；
- traditional leasing 面向企业招商与商业租赁，拥有线索、报价、企业商业合同、应收、收款核销、开票、减免、退租与退款。

两者会竞争同一经营房源，也复用 Party、scope、展示和导航能力。共享资源并不意味着合同与账本语义相同。立即合并会同时引入金融历史迁移、兼容路由、权限重映射、状态映射和并发控制风险。

## 2. 决策

短期及未满足 §7 全部触发条件期间，housing 与 traditional leasing 维持两个 bounded context。`long_rent` 是经营分类，不是第三套合同模型，也不是把两域合并成一个 aggregate 的依据。

跨域协作只通过共享标识、显式 port、只读 blocker 与数据库约束完成：

- 共享 `(tenantId, parkId)` scope、`unitId`、物理资产映射和 Party profile/role；
- 共享 property operation mode、occupancy authority、房态投影和用途约束；
- 共享 Design System、对象选择器、导航原语和经权限裁剪的展示能力；
- 各域保留自己的 owner workflow、API/permission namespace、状态机、合同主表及财务审计账本。

任何跨域映射都必须声明 source domain/type/id、方向、幂等和审计语义。不存在隐式合同转换、跨域直接改表或双主写。

## 3. 上下文职责

| 维度 | Housing | Traditional leasing |
|---|---|---|
| 主要相对方 | `tenantPartyId` 与 occupants | 企业 `parkTenantId`、招商联系人 |
| 合同根 | `HousingLeaseEntity` | `LeasingContractEntity` |
| 生命周期 | housing 字符串状态机与签署/激活/交割 owner commands | 招商、商业合同数字状态机与审批/生效/退租 commands |
| 财务 | charge plan、housing receivable、ledger entry、押金/退款/减免 effect | receivable、payment/application、invoice、waiver、checkout/refund 及状态/关系日志 |
| API 与权限 | `/housing/*`、`housing:*` | `/leasing/*`、`leasing_*` |
| 占用集成 | 激活/终止通过 occupancy port 创建、激活、释放 | 现有有效商业合同 relation 作为独立可用性 blocker；未隐式回填成 housing lease |

住房或办公用途本身不决定上下文。主体、交易语义、合同/财务流程和 owner workflow 共同决定归属；调用方不得只按 `usage_type` 把记录搬入另一上下文。

## 4. 共享基础设施清单

| 共享能力 | 权威与使用规则 |
|---|---|
| 物理资产与经营房源 | `asset_*` 与 `biz_unit`；`asset_unit_id` 是显式映射，不新建第三套房源主数据 |
| Tenant/Park scope | 每次读写均受 `(tenantId, parkId)` 与 data scope 约束；共享 ID 不放宽可见范围 |
| Operation mode | `biz_property_operation_config`；`long_rent` 允许合规用途，但不选择合同 aggregate |
| Occupancy | `biz_property_occupancy`、`PropertyOccupancyPort`、exclusion/advisory lock；owner workflow 在本事务推进 |
| Rental status | `biz_unit.rental_status` 生命周期投影；不是 availability 或合同状态权威 |
| Party/identity/consent | Party profile/role、purpose-specific submission/snapshot、append-only consent fact；业务域只消费授权结果 |
| Approval/event runtime | 冻结 payload、source version、execution key、outbox/inbox/DLQ；不以共享 runtime 接管业务状态机 |
| Web primitives | Design System、picker、formatter、导航与 breadcrumb 原语；对象索引必须 permission-aware 且 park-scoped |

## 5. 共存与集成原则

1. 同一时间范围内的房源冲突由共享 occupancy blocker 与传统合同 relation blocker 分别读取，并由数据库约束联合阻断；两者都不是对方 aggregate 的写权威，`rental_status` 也不能单独判断可用性。
2. Housing 只能通过 occupancy port 推进自己来源的占用；不得直接调用 leasing service 或修改传统合同。
3. Traditional leasing 继续拒绝住宅用途房源的商业合同绑定；用途切换必须检查两域 active blocker。
4. Party 只共享相对方身份与角色，不共享合同主体 aggregate。Housing 的 `tenantPartyId` 不等于商业租户 `parkTenantId`。
5. 两域独立结算、作废和保留审计。Receivable/payment 的 soft-delete + void、应用/开票/减免阻断不得因跨域整合被绕过。
6. 跨域报表或工作台使用只读 projection，并携带 source domain 和 source id；不得由 projection 反向成为业务写权威。

## 6. 明确不做

- 不合并 housing 与 leasing 的合同表、状态枚举或财务账本。
- 不用双写建立两个可独立修改的 source of truth。
- 不一次性回填或重解释历史合同、应收、付款、发票、减免、退租或退款。
- 不复用 URL/权限名称来暗示对象语义相同，也不通过兼容 alias 放宽窄权限或跨园区 scope。
- 不编辑既有成功 migration；未来 schema 变化仍必须 forward-only。

## 7. 未来收窄或合并边界的触发条件

以下是全部必要条件，不是自动授权。新 ADR 必须在任何演练或双写开始前冻结一份机器可读的 acceptance manifest，写明数据集合、环境、观察窗口、数值阈值、证据产物、owner 与失效条件；每项都必须有可重复的对账、回滚和审计证据。满足后仍需新的 ADR、专项 migration 设计、金融评审和分阶段发布批准。

1. **业务语义冻结**：产品与领域 owner 批准主体、合同条款、收费、交割、退租和异常处理的逐字段语义映射；无法无损映射的对象有明确保留边界。
2. **状态与命令等价**：两套状态机和 owner commands 有版本化 mapping，包含 rejected/void/terminated、签署/生效、部分核销、审批重放和失败恢复；不存在靠默认值吞掉状态。
3. **金融只读对账先通过**：在不改变 source of truth 的条件下，对 acceptance manifest 冻结的完整数据集合连续完成其预定窗口的全量及增量对账；窗口至少覆盖一个完整结算周期及一次关账，合同、应收、付款 application、发票、减免、押金、退款、退租的金额、关系、状态和审计链均为零未解释差异。
4. **迁移与回读可逆**：forward-only 迁移、历史 ID/source mapping、批次审计、校验和、失败停止、备份与回滚/兼容回读方案经演练；不得以删除旧账本作为切换步骤。
5. **单一写权威**：若引入双写，只能作为有期限的迁移机制，并有幂等键、顺序、补偿、差异告警与明确停写点；正式切换后每个 aggregate 只有一个 owner。
6. **并发不变量得到证明**：occupancy exclusion、用途切换、lock order、合同/checkout 并发、重复提交和金融 application 在目标模型有数据库级与服务级测试证据。
7. **API/权限兼容完成**：旧新 endpoint、route、permission 和 audit actor 映射经过窄权限、多园区及未知旧值测试；兼容层有遥测、灰度、回退和退役标准。
8. **运行与发布门禁完成**：真实数据脱敏演练、性能容量、灾难恢复、财务签字、UAT 与分阶段 rollout/rollback 均达到 acceptance manifest 预先冻结的数值阈值，并留存 run、报告、审批人与精确 SHA；任何阈值缺失、证据过期或不可解释差异都会阻止切换。

在触发条件完成前，只允许统一术语、导航、Design System、共享 picker、Party/occupancy/approval/event 基础设施及只读 projection；这些复用不能改变本 ADR 的 aggregate ownership。

## 8. 后果

正向结果是金融审计和业务 owner 保持清晰，两个团队可以在共享冲突约束下独立演进，且导航体验能够先行统一。代价是短期保留两套 API、状态与财务模型，跨域报表需要显式 projection，未来若确需合并还要承担独立迁移项目成本。

## 9. 权威与证据

- [房产业务 canonical 领域蓝图](property-canonical-domain-blueprint.md)
- [房产业务当前态设计索引](property-current-state-index.md)
- [共享房产底座](shared-property-foundation.md)
- [Shared Property Occupancy](../../.trellis/spec/api/backend/shared-property-occupancy.md)
- [Property Approval Domain Effects](../../.trellis/spec/api/backend/property-approval-domain-effects.md)
- [PMA 审查与 D-04 来源](../reviews/property-modules-modernization-audit-2026-09-04.md)

实现细节冲突时仍遵循 shared ABI → `.trellis/spec` → architecture 文档 → 时点 UAT/归档证据的权威顺序。本 ADR 决定上下文 ownership 与合并门槛，不覆盖可执行状态和事务契约。
