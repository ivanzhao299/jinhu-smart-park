# JinHu Smart Park workorders.stats numeric 隔离库 bootstrap 审查

## 1. 目的

本文记录 ST-2B-1B：`workorders.stats.numeric` 隔离库初始化与固定样本 bootstrap 的执行结果。

本阶段只准备隔离数据库、执行 migration / seed / snapshot bootstrap、执行 SQL 门禁和默认 schema 快照检查；未生成 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`，未执行 numeric `UPDATE_SNAPSHOTS=true`。

## 2. 隔离库信息

- 数据库名：`jinhu_smart_park_snapshot_numeric`
- PostgreSQL 容器：`jinhu-smart-park-postgres`
- API base URL：`http://localhost:3002/api/v1`
- 是否独立库：是
- 是否 reset 当前库：否
- 当前污染库 `jinhu_smart_park`：未 drop、未 truncate、未删除工单

API 启动时显式指向隔离库：

```bash
APP_PORT=3002 \
POSTGRES_HOST=localhost \
POSTGRES_PORT=5432 \
POSTGRES_DB=jinhu_smart_park_snapshot_numeric \
POSTGRES_USER=jinhu \
POSTGRES_PASSWORD=jinhu123 \
pnpm dev:api
```

说明：当前 Docker 容器环境变量中仍显示 `POSTGRES_PASSWORD=change_me`，但实际本地 TCP 连接使用仓库 `.env` 中的 `jinhu123` 才能成功启动 API。

## 3. 执行命令

### 创建隔离库

```bash
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  createdb -U jinhu jinhu_smart_park_snapshot_numeric

docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U jinhu -d jinhu_smart_park_snapshot_numeric -P pager=off \
  -c "select current_database();"
```

确认结果：

```text
current_database = jinhu_smart_park_snapshot_numeric
```

### 执行 migration

```bash
POSTGRES_DB=jinhu_smart_park_snapshot_numeric pnpm db:migrate
```

结果：

```text
Total files: 141
Skipped files: 0
Succeeded files: 141
Failed files: 0
Migrations applied.
```

执行中出现项目已知 warning：

```text
WARNING: duplicate migration prefix 000136 appears 2 times
```

该 warning 未阻断 migration。

### 执行 seed

```bash
POSTGRES_DB=jinhu_smart_park_snapshot_numeric \
ALLOW_DEV_SEED=yes \
pnpm db:seed:dev
```

结果：development seed applied。

### 执行 snapshot bootstrap

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/bootstrap-api-snapshot-data.mjs
```

结果：

- 创建 `SNAPSHOT-UNIT-001`
- 创建 `SNAPSHOT-WO-001`
- bootstrap completed

重复执行 bootstrap 后：

- `SNAPSHOT-UNIT-001` 已存在，不重复创建
- `SNAPSHOT-WO-001` 已存在，不重复创建

## 4. 门禁 SQL 结果

用户提供的门禁 SQL 使用 `biz_asset_unit` 和 `deleted_at`。当前实际 schema 使用：

- `biz_unit`
- `is_deleted`
- `unit_code`
- `biz_work_order.create_time`

因此按实际 schema 调整 SQL。

执行结果：

```text
current_database      = jinhu_smart_park_snapshot_numeric
active_workorders     = 1
regression_workorders = 0
snapshot_workorders   = 1
snapshot_units        = 1
```

当前 active 工单：

```text
SNAPSHOT-WO-001 | status=10 | priority=medium | wo_type=repair | has_assignee=false
```

门禁判断：

- 当前数据库正确。
- `WO-%` 回归工单为 0。
- 固定 workorder 为 1。
- 固定 unit 为 1。
- active workorders 可解释：仅固定样本 `SNAPSHOT-WO-001`。

## 5. 默认 schema 快照结果

执行命令：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

结果：未通过。

失败原因不是 `workorders.stats` schema，而是隔离库固定样本关联的 unit / building / floor 与当前默认 baseline 中历史样本不同，导致以下 snapshot mismatch：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`
- 以及后续被截断显示的其它差异

本阶段未使用 `UPDATE_SNAPSHOTS=true` 更新默认 baseline。

## 6. 禁止事项确认

已确认：

- 未运行 `node scripts/e2e/first-release-workorders.mjs`
- 未生成 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`
- 未执行 numeric `UPDATE_SNAPSHOTS=true`
- 未修改默认 baseline `scripts/e2e/snapshots/first-release-api-snapshots.json`
- 未修改快照脚本
- 未修改业务代码
- 未修改 seed / migration
- 未接入 CI
- 未修改 `package.json` / `pnpm-lock.yaml`
- 未 drop / truncate 当前污染库
- 未删除当前污染库工单

## 7. 结论

ST-2B-1B 的隔离库初始化、migration、seed、snapshot bootstrap 和 SQL 门禁已完成。

但默认 schema 快照检查尚未通过，原因是默认 baseline 仍依赖当前历史样本形态，而 fresh 隔离库中的固定样本来自 dev seed 的楼栋 / 楼层 / 单元结构。

因此当前不建议进入 ST-2B-1C 生成 numeric baseline。进入 ST-2B-1C 前，需要先明确默认 baseline 对隔离库样本的要求，或调整 ST-2B-1C 的门禁策略，避免在默认 baseline 不通过的状态下提交 numeric baseline。
