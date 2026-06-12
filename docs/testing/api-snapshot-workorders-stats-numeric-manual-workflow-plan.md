# JinHu Smart Park workorders.stats numeric manual workflow 评估

## 1. 评估目的

本文用于评估是否需要为 `workorders.stats.numeric` 增加手动触发检查流程。

本阶段只做文档评估，不修改 `.github/workflows`，不修改快照脚本，不修改默认 baseline，不修改 numeric baseline，不接入 CI。

## 2. 当前状态

当前状态：

- 默认 schema baseline 已稳定。
- `workorders.stats.numeric` baseline 已建立。
- numeric 模式已支持显式运行。
- 当前未接入 CI / workflow。
- 当前仓库已有 `.github/workflows/ci.yml` 和 `.github/workflows/deploy-production.yml`，但没有 `workorders.stats.numeric` 专用 manual workflow。

numeric baseline 文件：

```text
scripts/e2e/snapshots/first-release-api-snapshots.numeric.json
```

## 3. numeric 检查定位

`workorders.stats.numeric` 检查定位：

- 非默认检查。
- 非普通 PR 必跑。
- 非 push 自动检查。
- 用于 release candidate 前统计口径专项验证。
- 需要 fixed dataset、fresh 隔离库或明确 reset 后测试库。
- 不应在共享污染库中运行后据此更新 baseline。

## 4. 当前手动命令

当前手动检查命令：

```bash
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

如 API 不使用默认地址，应显式传入：

```bash
API_BASE_URL=<actual-api-base-url>
```

该命令必须在满足 numeric baseline 门禁的 fixed dataset 环境下执行。门禁至少包括：

- `SNAPSHOT-BLD-001 = 1`。
- `SNAPSHOT-FLR-001 = 1`。
- `SNAPSHOT-UNIT-001 = 1`。
- `SNAPSHOT-WO-001 = 1`。
- `WO-% = 0`。
- fixed association chain 成立。
- 默认 schema snapshot 先通过。
- 未运行写入型工单 e2e。

## 5. 方案评估

### 方案 A：继续本地手动执行

优点：

- 简单。
- 不增加 CI 复杂度。
- 不消耗 GitHub Actions 资源。
- 风险最低。

缺点：

- 依赖人工执行。
- 结果不集中。
- release candidate 前需要人工记得触发并记录结果。

### 方案 B：新增 workflow_dispatch 手动 workflow

优点：

- 流程标准化。
- 可作为 release candidate 前专项检查。
- 便于沉淀日志。

缺点：

- 需要维护 workflow。
- 需要处理数据库初始化、migration、seed、bootstrap 和 API 启动。
- 会消耗 GitHub Actions 资源。
- 如果数据库 reset 能力不足，仍可能出现误报。

### 方案 C：接入 pull_request / push

不推荐。

原因：

- numeric baseline 对固定数据集强依赖。
- 普通 PR 自动跑容易误报。
- 会增加 CI 成本和维护成本。
- 普通 PR 中写入型 e2e 或测试顺序变化可能污染 numeric count。

## 6. workflow 设计边界

如后续实现，建议边界为：

- 仅使用 `workflow_dispatch`。
- 不接入 `pull_request`。
- 不接入 `push`。
- 不允许自动更新 baseline。
- 不运行写入型工单 e2e。
- 必须使用 fresh / reset 后固定数据集。
- 必须先运行 default schema check。
- 再运行 numeric check。
- 失败时只报错，不自动修复。
- 不提交任何生成文件。

manual workflow 不应包含：

```bash
UPDATE_SNAPSHOTS=true
```

## 7. workflow 输入建议

可选输入：

- `api_base_url`
- `snapshot_workorder_no`
- `snapshot_unit_no`
- `confirm_numeric_snapshot`

更稳方案是 workflow 内部启动隔离数据库和 API，执行 migration / seed / bootstrap，并在同一 job 内完成 default schema check 与 numeric check。这样可以避免外部 API 和数据库状态不一致。

如果允许输入外部 `api_base_url`，应要求显式确认该环境已经满足 numeric baseline 门禁，且不允许 workflow 更新 baseline。

## 8. baseline 更新规则

manual workflow 只检查，不更新 baseline。

规则：

- 不允许在 workflow 中执行 `UPDATE_SNAPSHOTS=true`。
- 不允许 workflow 自动提交或上传 baseline diff 作为可直接合并产物。
- numeric baseline 更新必须单独 PR。
- numeric baseline diff 必须人工审查。
- baseline 更新仍必须说明数据来源、运行顺序、是否 reset、是否独立库、是否运行过写入型 e2e。

## 9. GitHub Actions 成本和风险

当前不建议进入普通 CI。

如果后续启用 manual workflow，需要考虑：

- GitHub Actions 分钟数。
- PostgreSQL 服务启动时间。
- migration / seed / bootstrap 耗时。
- API 启动和健康检查稳定性。
- numeric baseline 对固定数据集的强依赖。
- workflow 失败时如何区分环境问题和真实统计口径回归。

仅在 release candidate 前手动使用更合理。

## 10. 推荐结论

推荐：

- 短期继续本地手动执行。
- 中期可设计 `workflow_dispatch`。
- 不进入普通 PR CI。
- 不进入 push 自动检查。
- manual workflow 只做检查，不更新 baseline。
- 下一步如需推进，进入 ST-2C-1：manual workflow 设计，不直接实现。

ST-2C 收口复核见 `docs/testing/api-snapshot-workorders-stats-numeric-manual-workflow-closure-review.md`。当前建议 ST-2C 阶段性收口，短期继续本地手动执行。

## 11. 暂缓范围

继续暂缓：

- 修改 `.github/workflows`。
- 接入普通 CI。
- 自动更新 baseline。
- 扩展更多 numeric 接口。
- 运行写入型 e2e 后做 numeric 检查。
- 在 workflow 中生成或提交 baseline。
