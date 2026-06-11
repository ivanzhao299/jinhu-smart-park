# JinHu Smart Park 接口快照固定测试数据设计

## 1. 设计目的

本文用于设计接口快照所需的固定测试数据，降低 baseline 对本地脏数据、列表第一条和写入型 e2e 的依赖。

本阶段只做文档设计，不修改脚本、不修改 baseline、不修改 seed、不修改业务代码、不接入 CI。

## 2. 背景

当前快照脚本 `scripts/e2e/first-release-api-snapshots.mjs` 已支持固定业务编号：

- `SNAPSHOT_WORKORDER_NO`
- `SNAPSHOT_UNIT_NO`
- `ALLOW_SNAPSHOT_FALLBACK=true`

固定业务标识机制已经能让脚本通过业务编号查找工单和房源样本。但固定编号对应的数据来源尚未定义。

如果目标环境中不存在固定样本：

- 设置固定业务编号时脚本会默认失败。
- 显式启用 `ALLOW_SNAPSHOT_FALLBACK=true` 时可回退第一条。
- fallback 仅适合本地临时调试。
- fallback 生成的 baseline 不建议提交。

因此继续扩大快照使用范围前，需要先明确固定测试数据来源。

## 3. 当前数据现状

### 3.1 固定工单样本

当前没有发现 `SNAPSHOT-WO-001` 这类 snapshot 专用固定工单样本。

现有 `first-release-workorders.mjs` 会创建工单，但其工单编号来自：

```text
WO-${TEST_RUN_ID}
```

默认 `TEST_RUN_ID` 带当前时间和随机后缀，因此适合流程回归，不适合作为长期稳定快照锚点。

production seed 当前只初始化工单权限、字典、编码规则和 SLA 规则等生产安全基础数据，不创建 demo 工单。

### 3.2 固定房源样本

当前没有发现 `SNAPSHOT-UNIT-001` 这类 snapshot 专用固定房源样本。

development seed 中已有稳定的本地测试房源，例如：

- `JH-B01-F01-R0101`
- `JH-B01-F01-R0102`
- `JH-B01-F02-R0201`
- `JH-B01-F03-R0301`
- `JH-B02-F01-R0101`

这些房源来自 `database/seeds/000002_dev_only_s1_accounts.sql`，用途是本地开发和 smoke 测试，不是 snapshot 专用数据。

production seed 明确不创建固定密码账号或 demo 业务数据，也不创建 S2 demo 房源数据。

### 3.3 现有 e2e 数据

现有 e2e 中存在写入行为：

- `first-release-workorders.mjs` 创建并派单工单。
- `first-release-users-assets.mjs` 创建用户、重置密码、分配角色；资产部分只读。
- `first-release-leasing.mjs` 会创建 `BUNIT-*` 房源。
- `s2b-smoke.mjs`、`s3c-contract-smoke.mjs`、`s3e-contract-lifecycle-smoke.mjs` 等专项 smoke 会创建或修改房源。

这些数据适合验证业务流程，不适合直接作为长期快照固定样本。

### 3.4 当前测试数据是否适合作为长期锚点

当前测试库里的已有样本不适合作为长期统一锚点，原因是：

- 来源不统一。
- 可能由不同 e2e 或本地手动操作产生。
- 可能被状态流转、合同、导入导出或清理脚本影响。
- 不同本地环境不保证存在同一条记录。

## 4. 固定数据目标

### 工单固定样本

建议业务编号：

```text
SNAPSHOT-WO-001
```

用途：

- 工单详情快照。
- 工单日志快照。
- 工单列表稳定样本。
- 后续工单 stats 口径参考。

### 房源固定样本

建议业务编号：

```text
SNAPSHOT-UNIT-001
```

用途：

- 房源详情快照。
- 房源列表稳定样本。
- 房源 statistics 口径参考。

## 5. 工单固定样本设计

固定工单至少需要：

- 稳定工单编号：建议 `SNAPSHOT-WO-001`。
- 稳定标题：例如 `Snapshot work order 001`。
- 稳定类型：按当前枚举使用实际接口支持值，例如 `repair`。
- 稳定优先级：按当前枚举使用实际接口支持值，例如 `medium`。
- 稳定紧急程度：按当前枚举使用实际接口支持值，例如 `normal`。
- 稳定状态：建议保持在不会被普通回归流转的初始或静态状态。
- 所属租户：默认测试租户 `10000001`。
- 所属园区：默认测试园区 `20000001`。
- 可选关联房源：如需要跨快照关联，可关联 `SNAPSHOT-UNIT-001`。
- 至少一条稳定日志：如果继续覆盖 `workorders.logs`，需要保证固定工单存在可复核日志。

设计约束：

- 不依赖动态时间判断。
- 不自动进入逾期重算。
- 不作为状态流转测试对象。
- 不被 `first-release-workorders.mjs` 修改。
- 不被普通清理脚本误删。
- 不把数据库 `id` / UUID 作为外部配置。

## 6. 房源固定样本设计

固定房源至少需要：

- 稳定房源编号：建议 `SNAPSHOT-UNIT-001`。
- 稳定房源名称：例如 `Snapshot Unit 001`。
- 所属租户：默认测试租户 `10000001`。
- 所属园区：默认测试园区 `20000001`。
- 所属楼栋 / 楼层：应引用稳定楼栋和楼层。
- 稳定出租状态。
- 稳定启用状态。
- 稳定面积字段，例如 `unit_area` / `use_area`。
- 稳定用途字段，例如 `usage_type`。
- 稳定装修状态字段，例如 `fitting_status`。

设计约束：

- 不被导入导出测试修改。
- 不被状态变更测试修改。
- 不被合同、租赁、退租、招商等流程用作可变业务对象。
- 不依赖动态可用日期进行断言。
- 不把数据库 `id` / UUID 作为外部配置。

## 7. 数据来源方案

### 方案 A：复用现有 seed

说明：

- 复用 development seed 中已有 `JH-*` 房源。
- 不为工单新增固定样本。

优点：

- 简单。
- 不新增脚本。
- 本地环境已有一定基础数据。

缺点：

- production seed 不适合加入 demo 业务数据。
- dev seed 当前不是 snapshot 专用。
- `JH-*` 房源可能被其它 smoke 用作通用样本。
- 无法解决固定工单样本来源。

判断：不建议直接把 snapshot 固定数据放入 production seed；也不建议当前阶段直接改 dev seed。

### 方案 B：新增 snapshot bootstrap 脚本

示例：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

说明：

- 通过 API 或受控数据库方式幂等准备固定工单和固定房源。
- 仅在本地 / 测试环境手动运行。
- 不进入 production seed。
- 不接入常规 CI。

优点：

- 与快照测试绑定。
- 可复制。
- 可逐步声明固定数据所有权。
- 可以避免污染 production seed。

缺点：

- 需要维护创建逻辑。
- 该 bootstrap 本身具有写入行为。
- 需要设计幂等、权限、清理和数据隔离规则。

判断：推荐作为中期方案，但本阶段不实现。

### 方案 C：手动准备固定数据

说明：

- 由测试人员在目标环境手动创建 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001`。

优点：

- 不改代码。
- 不改 seed。

缺点：

- 不可复制。
- 不适合团队协作。
- 容易因字段缺失或状态差异造成 baseline 波动。

判断：只适合短期临时验证，不适合作为长期方案。

### 方案 D：专用测试环境预置数据

说明：

- 在专用测试环境中预置固定 snapshot 数据。
- 快照脚本只读使用这些数据。

优点：

- 环境稳定。
- 适合后续手动 workflow 或 release-smoke label。

缺点：

- 对环境管理要求高。
- 需要数据维护和变更审批。
- 仍需要 bootstrap 或初始化说明支撑。

判断：适合作为长期方案，前提是固定数据维护规则成熟。

## 8. 推荐方案

### 短期

建议：

- 不改 production seed。
- 不改 dev seed。
- 不改快照脚本。
- 不更新 baseline。
- 手动确认目标环境是否存在固定样本。
- 使用 `SNAPSHOT_WORKORDER_NO` / `SNAPSHOT_UNIT_NO` 做只读验证。
- 如果固定样本不存在，不提交 fallback baseline。

### 中期

建议：

- 先设计 snapshot bootstrap。
- 再实现幂等 bootstrap 脚本。
- bootstrap 只在本地 / 测试环境手动运行。
- bootstrap 创建或确保 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001`。
- bootstrap 不进入 production seed。
- bootstrap 不作为普通 e2e 的隐式前置步骤。

### 长期

建议：

- 考虑 snapshot 专用只读账号。
- 考虑专用测试环境预置数据。
- 考虑手动 workflow 或 release-smoke label。
- 仍不直接进入常规 CI。

## 9. 是否需要 snapshot 专用账号

短期不建议立即引入 snapshot 专用账号。

分析：

- 固定测试数据解决样本稳定问题。
- 专用账号解决权限范围和数据范围稳定问题。
- 当前管理员账号已经可运行快照脚本。
- 专用账号需要初始化、授权、密码管理和文档维护。

建议：

- 短期继续使用当前管理员账号。
- 中期先完成固定测试数据和 bootstrap 设计。
- 如果后续接入 workflow 或 release-smoke label，再设计只读快照账号。

## 10. 与现有 e2e 的关系

固定测试数据应与现有 e2e 保持边界：

- `first-release-workorders.mjs` 不应修改 `SNAPSHOT-WO-001`。
- 固定快照工单不应作为派单、接单、完成、关闭等状态流转测试对象。
- `first-release-users-assets.mjs` 不应修改 `SNAPSHOT-UNIT-001`。
- 租赁、合同、退租、导入导出、状态变更 smoke 不应使用 `SNAPSHOT-UNIT-001` 作为可变业务对象。
- 快照测试建议在写入型 e2e 之前运行。
- 如必须先运行写入型 e2e，应确认固定样本未被修改。

可能影响：

- 如果 bootstrap 新增固定房源，会影响房源列表和 statistics 的总量。
- 如果 bootstrap 新增固定工单，会影响工单列表和 stats 的总量。
- 因此新增固定数据后，baseline 需要按维护规则审查更新。

## 11. baseline 维护影响

baseline PR 应说明：

- 使用的 `SNAPSHOT_WORKORDER_NO`。
- 使用的 `SNAPSHOT_UNIT_NO`。
- 固定样本来源：手动准备、bootstrap、测试环境预置或其它。
- 是否启用 fallback；提交 baseline 时应为否。
- 固定样本是否发生字段或状态变化。

baseline 更新前必须确认：

- 固定工单样本存在。
- 固定房源样本存在。
- 固定样本未被写入型 e2e 修改。
- 未使用 `ALLOW_SNAPSHOT_FALLBACK=true` 生成待提交 baseline。
- 如果 bootstrap 重新生成数据，baseline diff 只包含预期变化。
- baseline diff 不包含 token、密码、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL。

## 12. 后续实施路线

### FTD-1：固定测试数据设计

当前阶段。

产出：

- 明确固定工单和固定房源建议编号。
- 明确 production seed、dev seed、e2e 与 snapshot bootstrap 的边界。
- 明确 baseline 维护影响。

### FTD-2：snapshot bootstrap 设计

只做设计，不实现。

建议重点：

- bootstrap 文件路径。
- 运行环境限制。
- 幂等创建策略。
- 固定工单日志策略。
- 固定房源楼栋 / 楼层依赖。
- 是否通过 API 创建，还是使用受控 SQL。

### FTD-3：snapshot bootstrap 实施

新增幂等 bootstrap 脚本。

约束：

- 不接入 CI。
- 不修改 production seed。
- 不创建敏感账号或提交密码。
- 运行后必须审查 baseline diff。

### FTD-4：快照脚本使用固定样本作为推荐默认

在固定数据稳定后，文档可建议运行快照时显式设置：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

不建议在没有稳定数据前强制默认使用这些编号。

### FTD-5：评估只读账号和 workflow

固定数据和 baseline 维护流程稳定后，再评估：

- snapshot 专用只读账号。
- 手动 workflow。
- release-smoke label。
- 常规 CI。

## 13. 不建议事项

当前不建议：

- 把 snapshot 固定数据放入 production seed。
- 立即修改现有 dev seed。
- 让普通工单回归修改固定快照工单。
- 让租赁 / 合同 / 导入导出 / 状态流转测试修改固定快照房源。
- fallback 后提交 baseline。
- 每次快照前清空数据库。
- 立即新增 snapshot 专用账号。
- 立即接入 CI。
- 使用数据库 `id` / UUID 作为固定样本配置。

## 14. 结论

建议固定测试数据设计阶段性收口后，下一步进入 snapshot bootstrap 设计。

当前不建议修改 production seed、dev seed、快照脚本或 baseline。短期可继续依赖现有固定业务标识机制进行只读验证；中期应设计并实现一个手动、幂等、仅用于本地 / 测试环境的 snapshot bootstrap，用于确保 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001` 存在。固定数据稳定前，不建议接入 CI 或继续扩大快照覆盖范围。

后续同步：snapshot bootstrap 设计见 `docs/testing/api-snapshot-bootstrap-plan.md`。后续实施阶段已新增 `scripts/e2e/bootstrap-api-snapshot-data.mjs`，用于手动、幂等地检查或创建 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001`。该脚本不修改 seed，不接入 CI，不更新快照 baseline。

后续同步：bootstrap 收口复核见 `docs/testing/api-snapshot-bootstrap-closure-review.md`。固定样本已可通过 bootstrap 准备，下一步建议进入 baseline 更新审查。
