# PRD: PMA L-01 canonical 领域蓝图

## Goal

为 shared property control plane、housing 与 traditional leasing 建立单一当前态领域蓝图，把模型、状态机、owner workflow、事件/投影、身份/审批与跨域契约连接到可执行权威，并用自动对照门禁阻止文档、状态、endpoint 与 schema 漂移。

## Confirmed facts

- Issue: #706；来源为 PMA 审查 L-01（PMA-001~005、007）。
- 当前权威顺序保持为 `packages/shared` ABI → `.trellis/spec` 可执行契约 → architecture 摘要 → UAT/归档历史证据。
- `docs/architecture/property-current-state-index.md` 已是当前入口，但尚未完整展开三模块模型、状态迁移、owner command、事件/投影和 schema 对照。
- housing 与 traditional leasing 本项只描述当前双 bounded-context 事实；长期边界决策留给 L-02 D-04。
- 本项不改业务状态、数据库、API、权限、金融写路径或 HR。

## Requirements

1. 新增 canonical blueprint，逐域列出模型/表、持久状态与合法迁移、owner workflow/command、同步或异步事件/投影、身份/审批依赖。
2. 明确跨域共享键与边界：`tenantId/parkId`、`unitId`、Party、occupancy、`rental_status`、商业合同兼容冲突读取；不得暗示 housing 与 traditional leasing 已合并。
3. 明确 financial audit：receivable/payment/invoice/waiver/checkout 的状态投影、soft-delete/void 与应用阻断保持现状。
4. 建立自动对照脚本，至少对照 shared 状态枚举、controller endpoint、关键 entity/table/schema checks、owner/projection marker 与蓝图声明；漂移必须非零退出。
5. 对照脚本接入根 package script 与 CI verify 门禁，复用现有 manifest validator/contract-test 风格。
6. 更新当前态索引链接到蓝图，并保持历史材料只作为时点证据。

## Acceptance criteria

- 蓝图完整覆盖 property control plane、housing、traditional leasing，所有硬声明可追溯到代码/spec/migration。
- Housing canonical 持久态不包含 `signed`/`renewed`；`expiring` 的实际语义如实注明。
- Property occupancy owner workflow、半开区间、终态与 `rental_status` 投影边界明确。
- Leasing 核心 lead/contract/receivable/payment/invoice/waiver/checkout 状态和金融审计边界明确。
- 自动对照脚本在当前树通过；对状态/endpoint/schema 各做一个 mutation-style 负向抽查并确认会失败，随后干净恢复。
- package 门禁、相关既有 contract、shared build/lint/typecheck 通过；PR CI/Deploy 与归档遵循用户批准的 HR smoke 常设豁免规则并记录 run 链接。

## Out of scope

- 不修 HR cutover smoke/fixture。
- 不新增或修改 migration，不改变 API/runtime 状态机或金融逻辑。
- 不在 L-01 决定 housing 与 traditional leasing 的未来合并条件（L-02）。
- 不做浏览器 UAT（L-04）。

## Open questions

- 无阻塞项；用户已批准范围、顺序和门禁裁定。
