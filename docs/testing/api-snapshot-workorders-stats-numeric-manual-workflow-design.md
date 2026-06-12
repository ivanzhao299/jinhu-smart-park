# JinHu Smart Park workorders.stats numeric manual workflow 设计

## 1. 设计目的

本文用于设计 `workorders.stats.numeric` 手动专项检查 workflow。

本阶段只做设计文档，不修改 `.github/workflows`，不修改快照脚本，不修改 baseline，不修改业务代码，不接入 CI。

## 2. 当前状态

当前状态：

- `workorders.stats.numeric` baseline 已建立。
- 当前仅本地手动执行 numeric 检查。
- 当前未接入专用 workflow。
- 不进入普通 CI。
- 现有 `.github/workflows/ci.yml` 支持 `pull_request`、`push` 到 `main` 和 `workflow_dispatch`。
- 现有 `.github/workflows/deploy-production.yml` 支持 `workflow_dispatch`。
- 当前没有 `workorders.stats.numeric` 专用 workflow。

## 3. workflow 定位

`workorders.stats.numeric` manual workflow 定位为：

- release candidate 前专项检查。
- 人工触发。
- 非 PR 必跑。
- 非 push 自动检查。
- 只检查，不更新 baseline。
- 不替代默认 schema snapshot。
- 不替代首发业务流程回归。

## 4. 触发方式设计

建议仅使用：

```yaml
on:
  workflow_dispatch:
```

不支持：

- `pull_request`
- `push`
- `schedule`

原因：

- numeric baseline 对 fixed dataset 强依赖。
- 普通 PR / push 自动运行容易受测试顺序或数据污染影响。
- schedule 若无 reset 能力，同样可能积累污染数据。

## 5. 输入参数设计

候选输入：

- `snapshot_workorder_no`
- `snapshot_unit_no`
- `confirm_numeric_snapshot`

建议默认值：

```text
snapshot_workorder_no = SNAPSHOT-WO-001
snapshot_unit_no = SNAPSHOT-UNIT-001
confirm_numeric_snapshot = false
```

`confirm_numeric_snapshot` 应要求手动设置为明确值，例如：

```text
confirm_numeric_snapshot = true
```

不建议允许随意输入：

- `UPDATE_SNAPSHOTS`
- `SNAPSHOT_STATS_MODE`
- `ALLOW_STATS_NUMERIC_SNAPSHOT`

这些变量应由 workflow 固定设置为检查模式，而不是暴露给触发者自由组合。

### 方案 A：workflow 自建数据库和 API

推荐。

优点：

- 环境可控。
- 数据集可复现。
- 不依赖外部 API。
- 可在 workflow 内完成 migration / seed / bootstrap / gate check。

缺点：

- workflow 复杂度较高。
- 运行耗时和 Actions 资源消耗更高。

### 方案 B：输入外部 API_BASE_URL

不推荐作为首选。

风险：

- 外部环境不可控。
- 容易指向污染库。
- 难以复现失败。
- 难以证明 `WO-% = 0` 和固定关联链路成立。

如后续必须支持外部 `api_base_url`，应要求额外人工确认门禁，并禁止 baseline 更新。

## 6. 环境准备设计

建议 workflow 内部完成：

- 使用 `pnpm/action-setup` 安装 pnpm。
- 使用 `actions/setup-node` 安装 Node.js。
- 执行 `pnpm install --frozen-lockfile`。
- 启动 PostgreSQL。
- 创建专用测试库。
- 执行 migration。
- 执行必要 seed。
- 启动 API。
- 等待 API health / ready。
- 执行 `scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 验证固定样本。
- 验证 `WO-% = 0`。

当前项目已有命令：

```bash
pnpm db:migrate
ALLOW_DEV_SEED=yes pnpm db:seed:dev
pnpm dev:api
```

现有 CI 安装依赖方式：

```bash
pnpm install --frozen-lockfile
```

release-smoke 已展示可通过 Docker Compose 启动 PostgreSQL / API；manual workflow 小实现时可复用其思路，但应使用独立测试库和 dev seed / snapshot bootstrap，而不是 production seed 流程。

## 7. 执行顺序设计

建议顺序：

```text
1. Checkout
2. Setup pnpm / Node.js
3. Install dependencies
4. Start PostgreSQL
5. Run migration
6. Run seed
7. Start API
8. Run snapshot bootstrap
9. Run gate SQL / API checks
10. Run default schema snapshot check
11. Run numeric snapshot check
12. Upload logs
13. Tear down services
```

命令草案：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs

SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

如果 API 使用非默认端口，应显式传入：

```bash
API_BASE_URL=http://127.0.0.1:<port>/api/v1
```

## 8. 禁止事项

workflow 中禁止：

- `UPDATE_SNAPSHOTS=true`
- 自动提交 baseline
- 上传 baseline diff 作为可直接合并产物
- 运行 `node scripts/e2e/first-release-workorders.mjs`
- 运行其它会创建 / 派单 / 关闭 / 删除工单的写入型 e2e
- 修改数据库 seed / migration
- 修改 baseline 文件
- 使用污染库生成结果
- 接入 `pull_request` / `push`

## 9. 失败处理

建议：

- 任一检查失败则 workflow fail。
- 上传日志 artifact。
- 上传 Docker / API 诊断日志。
- 不自动修复。
- 不自动 update baseline。
- 不自动提交任何文件。
- 失败后由人工判断是环境问题、数据门禁失败、schema 回归还是 stats numeric 口径回归。

建议日志至少包括：

- migration log
- seed log
- API log
- bootstrap log
- gate check log
- default schema snapshot log
- numeric snapshot log

## 10. 安全边界

安全边界：

- 不接入普通 CI。
- 不作为 PR 必跑。
- 不作为 push 必跑。
- 仅 release candidate 前人工触发。
- baseline 更新仍走单独 PR。
- workflow 不接收 secrets 形式的生产数据库连接。
- workflow 不连接生产或共享测试库。
- workflow 不输出 token、密码、request id、trace id 或 signed URL。

## 11. 后续实施拆分

建议后续拆分：

### ST-2C-1A：workflow 设计收口

只做文档收口，不修改 `.github/workflows`。

### ST-2C-1B：workflow 小实现

建议范围：

- 新增 `.github/workflows/api-snapshot-numeric.yml`。
- 仅 `workflow_dispatch`。
- 不允许 `UPDATE_SNAPSHOTS`。
- 不接入 PR / push。
- workflow 内部准备 PostgreSQL、migration、seed、API 和 snapshot bootstrap。
- 先 default schema check，再 numeric check。

### ST-2C-1C：workflow 试运行与收口

建议范围：

- 手动触发一次。
- 审查日志和耗时。
- 确认未生成 baseline diff。
- 决定是否保留 workflow。

## 12. 推荐结论

建议可以设计 manual workflow，但不建议直接接入普通 CI。

后续若实现，应仅使用 `workflow_dispatch`，并由 workflow 内部自建数据库和 API。workflow 只允许检查，不允许 baseline 更新。
