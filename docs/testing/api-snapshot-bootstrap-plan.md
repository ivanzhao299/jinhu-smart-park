# JinHu Smart Park 接口快照 Bootstrap 设计

## 1. 设计目的

本文用于设计接口快照固定测试数据的 bootstrap 方案，为后续稳定准备 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001`。

本阶段起初只做设计，不新增脚本、不修改快照脚本、不修改 baseline、不修改 seed、不修改业务代码、不接入 CI。

后续实施阶段已新增手动 bootstrap 脚本：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

该脚本用于通过 API 幂等检查或创建 `SNAPSHOT-UNIT-001` 和 `SNAPSHOT-WO-001`。脚本仍不接入 CI，不修改 seed，不修改快照 baseline。

## 2. 背景

当前快照脚本 `scripts/e2e/first-release-api-snapshots.mjs` 已支持固定业务标识：

- `SNAPSHOT_WORKORDER_NO`
- `SNAPSHOT_UNIT_NO`
- `ALLOW_SNAPSHOT_FALLBACK=true`

固定测试数据设计已明确需要稳定样本：

- `SNAPSHOT-WO-001`
- `SNAPSHOT-UNIT-001`

设计阶段尚未创建这些固定样本。后续实施阶段已新增 `scripts/e2e/bootstrap-api-snapshot-data.mjs`，用于提供可复制、幂等、只在本地 / 测试环境手动运行的 bootstrap 能力。

## 3. 当前现状

设计阶段没有发现 snapshot bootstrap 脚本；实施阶段已新增：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

当前没有发现固定工单样本创建逻辑：

- `first-release-workorders.mjs` 会创建工单。
- 其工单编号来自 `WO-${TEST_RUN_ID}`。
- 默认 `TEST_RUN_ID` 带时间和随机后缀。
- 该逻辑适合流程回归，不适合作为长期固定快照样本来源。

当前没有发现 snapshot 专用固定房源创建逻辑：

- development seed 有 `JH-*` 房源样本。
- `first-release-leasing.mjs` 会创建 `BUNIT-*` 房源。
- 多个专项 smoke 会创建或修改房源。
- 这些数据不是 snapshot 专用样本。

seed 现状：

- production seed 初始化租户、园区、权限、字典、编码规则、SLA 规则等生产安全基础数据。
- production seed 不应包含 demo 工单或 demo 房源。
- development seed 可创建本地测试账号和 S2 本地测试资产，但当前不建议直接修改 dev seed 承担 snapshot 数据职责。

## 4. bootstrap 总体原则

snapshot bootstrap 应遵循：

- 只在本地 / 测试环境手动运行。
- 不进入 production seed。
- 不修改 production seed。
- 不自动清库。
- 不删除已有业务数据。
- 不修改已有非 snapshot 数据。
- 幂等执行。
- 优先通过 API 创建或校验。
- 不绕过业务校验、权限校验和状态逻辑。
- 不接入常规 CI。
- 不提交 token、临时响应文件或敏感信息。
- 输出清晰的 `[PASS] / [WARN] / [FAIL]`。

bootstrap 的目标是准备固定样本，不应替代业务流程回归。

## 5. API 方式与 SQL 方式对比

### API 方式

优点：

- 复用业务校验。
- 更接近真实回归路径。
- 不绕过权限和状态逻辑。
- 更容易发现接口约束变化。
- 可复用现有 e2e 登录、request、状态输出风格。

缺点：

- 依赖 API 可用。
- 依赖管理员账号。
- 可能受接口字段变化影响。
- 创建数据前需要查找稳定楼栋、楼层等前置资源。

### SQL 方式

优点：

- 快速直接。
- 不依赖 API 启动。
- 可精确控制底层字段。

缺点：

- 容易绕过业务规则。
- 容易破坏数据一致性。
- 容易遗漏审计日志、状态日志或派生字段。
- 与 API 行为脱节，维护成本高。
- 更容易误写共享或生产类环境。

建议结论：

- 优先 API 方式。
- 暂不建议 SQL 方式。
- 如未来确需 SQL，应另行设计安全边界、环境限制、事务策略和字段完整性检查。

## 6. 固定房源样本设计

建议样本：

```text
SNAPSHOT-UNIT-001
```

bootstrap 需要：

- 调用 `GET /park-units` 查找 `unitCode` / `code` 为 `SNAPSHOT-UNIT-001` 的房源。
- 如果存在，校验关键字段。
- 如果不存在，按最小字段创建。
- 关联稳定园区。
- 关联稳定楼栋和楼层。
- 保持稳定出租状态、启用状态、用途、面积、装修状态等关键字段。
- 不参与合同、状态变更、导入导出测试。
- 后续快照脚本通过 `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001` 定位。

可借鉴现有房源创建 payload 字段：

- `unitCode`
- `buildingId`
- `floorId`
- `unitName`
- `usageType`
- `unitArea`
- `useArea`
- `rentalStatus`
- `fittingStatus`
- `refPrice`
- `status`
- `remark`

bootstrap 不应把数据库 `id` / UUID 作为外部配置。ID 只用于创建后读取和校验。

## 7. 固定工单样本设计

建议样本：

```text
SNAPSHOT-WO-001
```

bootstrap 需要：

- 调用 `GET /work-orders` 查找 `woCode` / `code` 为 `SNAPSHOT-WO-001` 的工单。
- 如果存在，校验关键字段。
- 如果不存在，按最小字段创建。
- 尽量关联 `SNAPSHOT-UNIT-001`。
- 准备至少一条稳定日志。
- 不作为状态流转测试对象。
- 不被 `first-release-workorders.mjs` 修改。
- 后续快照脚本通过 `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001` 定位。

可借鉴现有工单创建 payload 字段：

- `wo_code`
- `title`
- `wo_type`
- `priority`
- `urgency`
- `description`
- `source_type`

如后续确定关联房源字段，应以当前 API 支持字段为准，不在本设计中臆造字段名。

## 8. 工单日志样本设计

`workorders.logs` 快照需要稳定日志。

可选方式：

- 使用工单创建后系统自动产生的日志。
- 或在后续确认存在安全写入接口后，由 bootstrap 创建一条固定内容日志。

建议：

- 初版 bootstrap 先依赖工单创建后的自动日志。
- 若自动日志内容包含动态时间或操作者差异，应由快照归一化规则处理。
- 如当前接口没有安全、明确的日志创建入口，不应为制造日志而直接 SQL 插入。
- 后续如果需要更强的日志稳定性，应单独设计日志样本创建策略。

## 9. 幂等性设计

bootstrap 应支持重复运行：

- 固定房源存在则不重复创建。
- 固定工单存在则不重复创建。
- 记录存在但关键字段不符合预期时给出明确 `[WARN]` 或 `[FAIL]`。
- 默认不覆盖已有 snapshot 样本。
- 默认不覆盖非 snapshot 数据。
- 不删除已有业务数据。
- 不清库。
- 对 snapshot 样本的任何更新都必须显式、可解释。

建议策略：

- 默认模式：只创建缺失样本，校验已存在样本。
- `DRY_RUN=true`：只检查，不写入。
- 后续如需修复已有样本，应另设显式开关，不作为初版默认能力。

## 10. 账号与权限

初期可以使用管理员账号执行 bootstrap。

原因：

- bootstrap 需要创建固定数据，天然需要写权限。
- 当前 e2e 脚本已复用管理员账号登录方式。
- 立即设计专用账号会引入账号初始化和权限维护问题。

后续可以拆分：

- bootstrap 使用管理员或专用写入账号。
- 快照读取使用 snapshot 专用只读账号。

当前不建议立即实现 snapshot 专用账号。若后续接入 workflow 或 release-smoke label，再设计只读账号和凭据管理。

## 11. 与现有 e2e 的关系

bootstrap 应在快照脚本前执行。

建议运行顺序：

```bash
node scripts/e2e/bootstrap-api-snapshot-data.mjs
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

关系约束：

- `first-release-workorders.mjs` 不应修改 `SNAPSHOT-WO-001`。
- `first-release-users-assets.mjs` 不应修改 `SNAPSHOT-UNIT-001`。
- `first-release-leasing.mjs`、合同、退租、导入导出、状态变更 smoke 不应使用 `SNAPSHOT-UNIT-001` 作为可变对象。
- 快照测试建议在写入型 e2e 前执行。
- 写入型 e2e 运行后如影响 baseline，应先检查是否误操作了 snapshot 样本。

bootstrap 不应成为 `first-release-regression.mjs` 的隐式前置步骤，直到固定数据和 baseline 维护规则进一步稳定。

## 12. 后续脚本设计建议

已新增：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

当前支持环境变量：

```text
API_BASE_URL
ADMIN_USERNAME
ADMIN_PASSWORD
TENANT_ID / DEFAULT_TENANT_ID
PARK_ID / DEFAULT_PARK_ID
SNAPSHOT_WORKORDER_NO
SNAPSHOT_UNIT_NO
DRY_RUN=true
```

当前默认值：

- `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001`
- `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001`
- `DRY_RUN=false`

当前行为：

- 登录获取 token。
- 通过 `GET /park-units` 查找固定房源。
- 通过 `GET /work-orders` 查找固定工单。
- 校验样本关键字段。
- 缺失时通过 API 创建样本。
- `DRY_RUN=true` 时只输出将创建的对象，不写入。
- 输出 `[PASS] / [WARN] / [FAIL]`。
- 默认不修改已有样本。
- 默认不写临时响应文件。
- 失败时输出清晰原因。

建议复用现有 e2e 风格：

- 环境变量命名。
- API base URL 处理。
- 登录获取 token。
- request helper。
- `[PASS] / [FAIL]` 输出。
- `process.exitCode` 处理。

## 13. 验证计划

后续实施时需要验证：

- `node --check scripts/e2e/bootstrap-api-snapshot-data.mjs`
- bootstrap 首次运行可创建样本。
- bootstrap 第二次运行不重复创建。
- `DRY_RUN=true` 不写入。
- 快照脚本可通过固定编号定位样本。
- 普通快照检查通过。
- 工单回归不修改固定工单样本。
- 用户资产回归不修改固定房源样本。
- `git diff --check` 通过。

建议后续实施验证命令：

```bash
node --check scripts/e2e/bootstrap-api-snapshot-data.mjs
DRY_RUN=true node scripts/e2e/bootstrap-api-snapshot-data.mjs
node scripts/e2e/bootstrap-api-snapshot-data.mjs
node scripts/e2e/bootstrap-api-snapshot-data.mjs
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-users-assets.mjs
git diff --check
```

是否执行 `pnpm lint` / `pnpm typecheck` 可根据脚本实现范围决定。

## 14. 不建议事项

当前不建议：

- 修改 production seed。
- 立即修改 dev seed。
- 直接 SQL 插入复杂业务数据。
- 每次运行前清库。
- bootstrap 自动覆盖已有非 snapshot 数据。
- bootstrap 默认覆盖已有 snapshot 样本。
- 让普通回归修改 snapshot 样本。
- 提交 fallback 生成的 baseline。
- 当前接入 CI。
- 把 bootstrap 加入 `first-release-regression.mjs` 默认链路。
- 提交 token、密码、临时响应文件。

## 15. 分阶段路线

### SB-1：bootstrap 设计

当前阶段。

产出：

- 明确 bootstrap 原则。
- 明确 API 优先、SQL 暂缓。
- 明确固定工单、房源、日志样本设计。
- 明确幂等性和验证计划。

### SB-2：bootstrap 脚本实施

新增：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

实施范围：

- 只准备固定 snapshot 样本。
- 不接入 CI。
- 不修改 production seed / dev seed。
- 不修改快照 baseline，除非后续验证需要且 diff 可解释。

### SB-3：快照脚本使用固定样本验证

运行：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

目标：

- 验证固定业务标识机制可稳定定位样本。
- 观察 baseline 是否因固定样本出现预期变化。

### SB-4：bootstrap 收口复核

确认：

- 首次创建稳定。
- 重复运行幂等。
- 不影响普通回归。
- baseline diff 可解释。

### SB-5：workflow / release-smoke label 设计

暂缓。

前置条件：

- bootstrap 稳定。
- baseline 维护规则稳定。
- 固定样本不被普通 e2e 修改。
- fallback 禁止策略明确。

## 16. 结论

`scripts/e2e/bootstrap-api-snapshot-data.mjs` 已在后续实施阶段新增。

bootstrap 采用 API 方式，手动运行，幂等准备 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001`。初版不修改 production seed、dev seed、baseline、CI 或 package 配置。固定样本准备完成并复核稳定后，再评估是否引入 snapshot 只读账号、手动 workflow 或 release-smoke label。
