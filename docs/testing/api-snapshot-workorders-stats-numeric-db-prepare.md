# JinHu Smart Park workorders.stats numeric 隔离库准备方案

## 1. 文档目的

本文用于记录 ST-2B-1A：`workorders.stats.numeric` baseline 建立前的隔离数据库准备方案。

本阶段只确认环境、命令顺序和门禁 SQL，不生成 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`，不修改快照脚本、默认 baseline、业务代码、seed、migration、CI 或依赖配置。

## 2. 当前数据库状态

当前本地 API / PostgreSQL 连接配置来自环境变量：

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

当前仓库 `.env` 中 `POSTGRES_DB=jinhu_smart_park`。当前 Docker PostgreSQL 容器内默认数据库也是 `jinhu_smart_park`。

只读检查确认当前 `jinhu_smart_park` 不满足 numeric baseline 建立门禁：

- `biz_work_order` active 工单数为 28。
- `wo_code like 'WO-%'` 的回归工单数为 27。
- 固定样本 `SNAPSHOT-WO-001` 存在。
- 固定样本 `SNAPSHOT-UNIT-001` 存在。

这些 `WO-%` 回归工单会污染 `workorders.stats.numeric` 的 `summary` 和 group counts，因此不建议继续使用当前 `jinhu_smart_park` 生成 numeric baseline。

## 3. 推荐隔离库

建议新建独立测试库：

```text
jinhu_smart_park_snapshot_numeric
```

该库只用于 `workorders.stats.numeric` baseline 建立和复核。建立 baseline 前必须完成 migration、必要 seed、API 指向隔离库、snapshot bootstrap，并通过门禁 SQL。

## 4. 命令草案

### 4.1 只读检查当前数据库列表

```bash
docker exec jinhu-smart-park-postgres \
  psql -U jinhu -d postgres -P pager=off \
  -c "select datname from pg_database where datistemplate = false order by datname;"
```

### 4.2 创建独立库

以下命令会修改 PostgreSQL cluster，但不删除已有数据。若数据库已存在，应停止并人工确认后续动作。

```bash
docker exec jinhu-smart-park-postgres \
  createdb -U jinhu jinhu_smart_park_snapshot_numeric
```

如果后续需要重建同名隔离库，以下操作属于 destructive，必须人工确认后才可执行：

```bash
# DANGEROUS: only after explicit human confirmation.
docker exec jinhu-smart-park-postgres \
  dropdb -U jinhu jinhu_smart_park_snapshot_numeric

docker exec jinhu-smart-park-postgres \
  createdb -U jinhu jinhu_smart_park_snapshot_numeric
```

不要对当前 `jinhu_smart_park` 执行 `dropdb`、`truncate` 或删除工单。

### 4.3 执行 migration

```bash
POSTGRES_DB=jinhu_smart_park_snapshot_numeric pnpm db:migrate
```

该命令会修改 `jinhu_smart_park_snapshot_numeric`，用于建立 schema 和 migration history。

### 4.4 执行 seed

本地 numeric baseline 建立建议使用 dev seed，以便获得本地 e2e 所需登录账号和基础数据：

```bash
POSTGRES_DB=jinhu_smart_park_snapshot_numeric \
ALLOW_DEV_SEED=yes \
pnpm db:seed:dev
```

如选择 production-safe seed 路线，则必须额外 bootstrap 登录管理员，并在后续 e2e 命令中显式传入对应账号密码：

```bash
POSTGRES_DB=jinhu_smart_park_snapshot_numeric \
ALLOW_PRODUCTION_SEED=yes \
pnpm db:seed:prod

POSTGRES_DB=jinhu_smart_park_snapshot_numeric \
ADMIN_USERNAME=<admin-user> \
ADMIN_PASSWORD=<admin-password> \
pnpm db:bootstrap:admin
```

seed 会修改隔离库。不要在共享库或生产库上执行 dev seed。

### 4.5 启动 API 指向独立库

```bash
POSTGRES_DB=jinhu_smart_park_snapshot_numeric \
POSTGRES_HOST=localhost \
POSTGRES_PORT=5432 \
pnpm dev:api
```

如果本机通过 `.env` 使用其它端口映射，应以实际 PostgreSQL 监听端口为准。

### 4.6 执行 snapshot bootstrap

`bootstrap-api-snapshot-data.mjs` 通过 API 写入固定样本。执行前必须确认 API 已指向 `jinhu_smart_park_snapshot_numeric`。

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/bootstrap-api-snapshot-data.mjs
```

该命令会通过 API 修改隔离库，预期确保固定样本存在；如果样本已存在，不应重复创建。

## 5. 生成 numeric baseline 前门禁 SQL

以下 SQL 应在隔离库 `jinhu_smart_park_snapshot_numeric` 中执行。

```sql
select current_database();

select
  count(*) filter (where is_deleted = false) as active_workorders,
  count(*) filter (where is_deleted = false and wo_code like 'WO-%') as regression_wo_count,
  count(*) filter (where is_deleted = false and wo_code = 'SNAPSHOT-WO-001') as snapshot_wo_count
from biz_work_order;

select
  count(*) filter (where is_deleted = false and unit_no = 'SNAPSHOT-UNIT-001') as snapshot_unit_count
from biz_unit;

select
  wo_code,
  status,
  priority,
  type,
  assignee_id is not null as has_assignee,
  created_at
from biz_work_order
where is_deleted = false
order by created_at desc
limit 20;
```

门禁期望：

- `current_database()` 必须为 `jinhu_smart_park_snapshot_numeric`。
- `regression_wo_count` 必须为 0。
- `snapshot_wo_count` 必须为 1。
- `snapshot_unit_count` 必须为 1。
- 最近 active 工单中不应出现 `WO-%` 回归污染工单。

若 SQL 字段名与当前 schema 不一致，应只读确认实际字段后调整查询；不得为通过门禁而删除或改写当前污染库数据。

## 6. 命令风险分类

只读检查：

- `git status --short`
- `git diff --name-only`
- `docker ps`
- `docker exec ... psql ... select ...`
- `grep` / `rg` / `sed` 查看配置与脚本

会修改隔离库但不应破坏当前库：

- `createdb jinhu_smart_park_snapshot_numeric`
- `POSTGRES_DB=jinhu_smart_park_snapshot_numeric pnpm db:migrate`
- `POSTGRES_DB=jinhu_smart_park_snapshot_numeric pnpm db:seed:dev`
- `node scripts/e2e/bootstrap-api-snapshot-data.mjs`，前提是 API 已指向隔离库

需要人工确认的 destructive 操作：

- `dropdb jinhu_smart_park_snapshot_numeric`
- 对任何库执行 `truncate`
- 删除或改写工单数据
- reset 当前 `jinhu_smart_park`
- 对当前污染库执行任何清理以迎合 numeric baseline

会生成文件、但不属于 ST-2B-1A：

- `SNAPSHOT_STATS_MODE=numeric ALLOW_STATS_NUMERIC_SNAPSHOT=true UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs`

该命令会生成 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`，只能在重新进入 ST-2B-1 且门禁 SQL 通过后执行。

## 7. ST-2B-1 进入条件

只有满足以下条件，才建议重新进入 ST-2B-1：

- 已创建或确认可用 `jinhu_smart_park_snapshot_numeric`。
- 已在隔离库完成 migration。
- 已在隔离库完成必要 seed。
- API 已明确指向隔离库。
- 已执行 snapshot bootstrap。
- 固定样本 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001` 存在。
- 门禁 SQL 确认 `WO-%` 回归污染工单数为 0。
- 生成 baseline 前未运行 `first-release-workorders.mjs`。
- 生成 baseline 前未运行其它会创建、派单、关闭或删除工单的写入型 e2e。

## 8. 结论

当前不建议继续使用 `jinhu_smart_park` 生成 `workorders.stats.numeric` baseline。

建议新建独立库 `jinhu_smart_park_snapshot_numeric`，完成 migration、seed、API 指向隔离库、snapshot bootstrap 和门禁 SQL 后，再重新进入 ST-2B-1 生成 numeric baseline。
