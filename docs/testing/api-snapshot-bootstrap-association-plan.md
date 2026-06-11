# JinHu Smart Park snapshot bootstrap 固定关联补强设计

## 1. 设计目的

本文用于设计 snapshot bootstrap 固定关联补强方案，使固定样本不再依赖 fresh dev seed 中的第一个可用 building / floor。

本阶段起初只做设计，不修改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`，不修改默认 baseline，不生成 numeric baseline，不修改 seed / migration，不修改业务代码，不接入 CI。

后续 SB-1 已实施 `scripts/e2e/bootstrap-api-snapshot-data.mjs` 的最小脚本能力：

- 支持 `SNAPSHOT_BUILDING_NO`，默认 `SNAPSHOT-BLD-001`。
- 支持 `SNAPSHOT_FLOOR_NO`，默认 `SNAPSHOT-FLR-001`。
- 支持 `ALLOW_SNAPSHOT_REPAIR`，默认 `false`。
- bootstrap 会创建或复用 snapshot building / floor。
- `SNAPSHOT-UNIT-001` 必须关联 snapshot building / floor。
- `SNAPSHOT-WO-001` 如响应暴露 unit association，则必须关联 `SNAPSHOT-UNIT-001`。
- 关联不一致时默认 fail，不自动 repair。
- numeric baseline 仍未生成。

## 2. 背景

当前 snapshot bootstrap 已能通过 API 幂等准备固定样本：

```text
SNAPSHOT-UNIT-001
SNAPSHOT-WO-001
```

但 ST-2B-1B 在 fresh 隔离库中执行 bootstrap 后，默认 schema 快照仍未通过。已确认 mismatch 主要来自：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`

fresh 隔离库中，fixed sample 关联到 dev seed 的 `JH-B01 / JH-B01-F01`；当前默认 baseline 则保留历史开发库中的 `BLD-* / FLR-*` 样本形态。

因此，仅固定 `unitCode / woCode` 不足以保证 fixed sample 的响应形态稳定。后续 numeric baseline 建立前，需要先让 fixed sample 的关联对象可复现。

## 3. 当前 bootstrap 行为

当前脚本：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

### 3.1 环境变量

脚本当前读取：

- `API_BASE_URL`，默认 `http://localhost:3001/api/v1`
- `ADMIN_USERNAME`，默认 `admin`
- `ADMIN_PASSWORD`，默认 `Jinhu@123456`
- `TENANT_ID` / `DEFAULT_TENANT_ID`，默认 `10000001`
- `PARK_ID` / `DEFAULT_PARK_ID`，默认 `20000001`
- `SNAPSHOT_UNIT_NO`，默认 `SNAPSHOT-UNIT-001`
- `SNAPSHOT_WORKORDER_NO`，默认 `SNAPSHOT-WO-001`
- `DRY_RUN`
- `IDEMPOTENCY_KEY_PREFIX`

脚本固定 tenant / park 上下文，但当前未提供 snapshot building / floor 的业务编号变量。

### 3.2 查找 / 创建 `SNAPSHOT-UNIT-001`

脚本先通过：

```text
GET /park-units?page=1&page_size=20&keyword=<SNAPSHOT_UNIT_NO>
```

查找 `unitCode / unit_code / code` 等于 `SNAPSHOT-UNIT-001` 的房源。

如果已存在：

- 不重复创建。
- 校验 unit code、unit name、status。
- 当前只 warn 字段差异，不校验 building / floor 关联是否符合 snapshot 专用模型。

如果不存在：

1. 调用 `findBuildingAndFloor(authHeaders)`。
2. 调用 `GET /buildings?page=1&page_size=20`。
3. 用 `firstUsableItem(buildings)` 选择第一个有 `id` 的 building。
4. 调用 `GET /floors?page=1&page_size=20&building_id=<building.id>`。
5. 选择该 building 下第一个匹配 buildingId 的 floor；如果没有，再 fallback 到 `firstUsableItem(floors)`。
6. 创建 `SNAPSHOT-UNIT-001`，payload 中使用选中的 `buildingId` / `floorId`。

### 3.3 查找 / 创建 `SNAPSHOT-WO-001`

脚本先通过：

```text
GET /work-orders?page=1&page_size=20&keyword=<SNAPSHOT_WORKORDER_NO>
```

查找 `woCode / wo_code / code` 等于 `SNAPSHOT-WO-001` 的工单。

如果已存在：

- 不重复创建。
- 校验 wo code、title、wo type、priority。
- 当前不校验 workorder 是否关联到目标 snapshot unit。

如果不存在：

- 使用固定 payload 创建工单。
- 若 `SNAPSHOT-UNIT-001` 返回了可用 `id`，则通过 `unit_id` 关联该 unit。
- 创建后验证工单日志列表。

### 3.4 当前未固定的部分

当前 bootstrap 未固定：

- snapshot building code
- snapshot floor code
- existing snapshot unit 的 building / floor 关联
- existing snapshot workorder 的 unit 关联

因此它仍依赖当前数据集中第一个可用 building / floor。

## 4. 问题分析

`unitCode / woCode` 固定不等于关联形态固定。

`SNAPSHOT-UNIT-001` 的嵌套 building / floor 会出现在：

- `units.detail`
- `units.list`
- `workorders.detail`

房源数据集本身还会影响：

- `units.statistics`
- `units.list` 的 first item / item count category

工单数据集本身还会影响：

- `workorders.list` 的 item count category
- `workorders.stats.numeric` 的 summary 和 group counts

因此，numeric baseline 建立前应先保证 schema baseline 的固定样本数据集可复现。当前 fresh 隔离库 mismatch 可以由 building / floor 关联不固定和默认 baseline 历史样本形态解释。

## 5. 目标固定关联模型

建议引入 snapshot 专用关联模型：

```text
SNAPSHOT-BLD-001
SNAPSHOT-FLR-001
SNAPSHOT-UNIT-001
SNAPSHOT-WO-001
```

建议关系：

```text
SNAPSHOT-FLR-001 belongs to SNAPSHOT-BLD-001
SNAPSHOT-UNIT-001 belongs to SNAPSHOT-FLR-001 / SNAPSHOT-BLD-001
SNAPSHOT-WO-001 references SNAPSHOT-UNIT-001
```

按当前 schema / API 语义，外部业务键建议对应：

- building: `buildingCode` / `building_code` / `code`
- floor: `floorCode` / `floor_code` / `code`
- unit: `unitCode` / `unit_code` / `code`
- workorder: `woCode` / `wo_code` / `code`

数据库 `id` / UUID 不作为配置项，只作为 API 返回后关联下一步创建的运行时值。

## 6. 数据创建策略

### 方案 A：继续复用 seed building / floor

优点：

- bootstrap 改动较小。
- 继续复用现有 dev seed。

缺点：

- 继续依赖 seed 排序和 seed 样本形态。
- fresh 库与历史库容易继续不一致。
- 不能彻底解释或消除当前 mismatch。

不推荐。

### 方案 B：bootstrap 创建 / 复用 snapshot 专用 building / floor

优点：

- fixed sample 的关联链路完整稳定。
- fresh 隔离库、reset 后本地库和历史开发库更容易对齐。
- 更适合后续 numeric baseline 建立和审查。
- 不把 snapshot 专用样本职责塞进 seed。

缺点：

- bootstrap 逻辑会变复杂。
- 需要验证 building / floor / unit / workorder 全链路幂等性。
- 可能仍需单独审查默认 baseline 是否需要对齐。

建议选择 B。

### 方案 C：修改 dev seed 创建 snapshot building / floor

优点：

- seed 后天然存在 snapshot building / floor。

缺点：

- 污染 dev seed 职责。
- snapshot 专用样本和通用 dev 数据耦合。
- 后续 numeric baseline 仍会依赖 seed 维护节奏。

不推荐。

## 7. 幂等规则

建议后续实现遵循以下规则：

- 如果 snapshot building 不存在，创建。
- 如果 snapshot floor 不存在，创建，并关联 snapshot building。
- 如果 snapshot unit 不存在，创建，并关联 snapshot building / floor。
- 如果 snapshot workorder 不存在，创建，并关联 snapshot unit。
- 如果对象已存在且关键字段一致，复用。
- 如果对象已存在但关联不一致，默认 fail。
- 默认不删除数据。
- 默认不自动修复已有 snapshot 样本。
- 默认不修改非 snapshot 数据。

对于已存在但关联不一致的情况，有两个候选：

### 方案 1：fail 并提示人工处理

优点：

- 风险最低。
- 不会静默改写历史样本。
- 更适合 first implementation。

缺点：

- 需要人工清理或后续显式修复流程。

推荐先采用。

### 方案 2：仅在 `ALLOW_SNAPSHOT_REPAIR=true` 时修正

优点：

- 可在隔离库中快速修复历史关联。
- 便于重新 bootstrap。

缺点：

- 需要严格限制环境。
- 容易误改共享库中的 snapshot 样本。
- 需要更多验证和文档门禁。

建议暂缓。

## 8. 环境变量设计

可考虑新增：

```text
SNAPSHOT_BUILDING_NO=SNAPSHOT-BLD-001
SNAPSHOT_FLOOR_NO=SNAPSHOT-FLR-001
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001
ALLOW_SNAPSHOT_REPAIR=false
```

设计原则：

- 保留现有 `SNAPSHOT_UNIT_NO` / `SNAPSHOT_WORKORDER_NO` 默认值。
- 新增 building / floor 默认业务编号。
- 未设置时仍使用 snapshot 默认值，不回退到第一个 seed building / floor 作为长期策略。
- `ALLOW_SNAPSHOT_REPAIR` 默认关闭。
- repair 行为必须单独设计和验证，本阶段不实现。

## 9. 后续实施建议

### SB-1：bootstrap 固定 building / floor 创建设计落地

状态：已实施。

- 只改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 新增查找 / 创建 snapshot building。
- 新增查找 / 创建 snapshot floor。
- 创建 unit 时使用 snapshot building / floor。
- existing unit / workorder 关联不一致时 fail。
- 不改 baseline。
- 不生成 numeric baseline。
- 验证重复执行幂等。

### SB-2：fresh 隔离库默认 schema 快照复测

- 在隔离库上重新执行 bootstrap。
- 执行门禁 SQL。
- 执行默认 schema 快照检查。
- 观察 `units.detail`、`units.list`、`units.statistics`、`workorders.detail`、`workorders.list` 是否仍 mismatch。

### SB-3：必要时更新默认 schema baseline

- 如果固定关联后 baseline 仍与历史样本不一致，再单独审查默认 baseline 更新。
- baseline 更新必须解释每个 diff。
- 不与 numeric baseline 建立混在同一 PR。

### SB-4：重新进入 ST-2B-1C numeric baseline 生成

- 只在默认 schema 通过后执行。
- 使用独立 numeric baseline。
- 不接入常规 CI。

## 10. 暂缓范围

继续暂缓：

- 直接修改 bootstrap 脚本。
- 直接更新默认 baseline。
- 生成 numeric baseline。
- 修改 seed / migration。
- 修改业务代码。
- 接入 CI。
- 扩展更多接口。
- 自动修复已有 snapshot 样本关联。

## 11. 结论

建议优先实施 bootstrap 固定关联补强，由 bootstrap 创建或复用 snapshot 专用 building / floor，并让 `SNAPSHOT-UNIT-001` 和 `SNAPSHOT-WO-001` 始终挂在这条固定关联链路上。

不建议直接刷新默认 baseline，也不建议跳过 schema mismatch 生成 numeric baseline。
