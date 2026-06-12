# JinHu Smart Park workorders.stats numeric baseline / manual workflow 阶段性总结

## 1. 收口目的

本文用于总结 `workorders.stats` 从默认 schema snapshot、numeric baseline 到 manual workflow 手动检查的完整闭环，作为后续 release gate 和 baseline 维护参考。

## 2. 背景问题

`workorders.stats` 原始 exact numeric snapshot 会受工单数量、状态、优先级、类型、负责人等数据变化影响。默认 API snapshot 如果冻结这些动态统计数值，容易在写入型 e2e 或污染测试库后产生非目标失败。

因此当前快照策略将默认稳定回归与 numeric 专项检查拆分：

- 默认回归检查结构、字段、类型和数组形态。
- numeric 专项检查在 fresh / isolated DB 固定数据集下验证统计口径。

## 3. 已完成事项

已完成事项：

- 默认 `workorders.stats` 改为 schema snapshot。
- 新增 `SNAPSHOT_STATS_MODE=schema|numeric`。
- numeric baseline 使用独立文件。
- fixed snapshot dataset 已固定 building / floor / unit / workorder 关联链路。
- numeric baseline 已基于 isolated DB 生成。
- manual workflow 已完成评估、设计、小实现和手动试运行。
- GitHub Actions 手动试运行已通过。

## 4. 默认 schema snapshot 结论

默认路径：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

结论：

- 默认 `workorders.stats` 输出 `snapshot_type: "workorders.stats.schema"`。
- 默认路径只检查结构、字段集合、类型类别和数组形态。
- 默认路径不冻结 `summary` / `by_*` 的动态 numeric count。
- 默认路径适合普通 API snapshot 回归。

## 5. numeric baseline 结论

numeric 专项检查路径：

```bash
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

numeric baseline 文件：

```text
scripts/e2e/snapshots/first-release-api-snapshots.numeric.json
```

结论：

- numeric baseline 输出 `snapshot_type: "workorders.stats.numeric"`。
- numeric baseline 覆盖 `summary`、`by_status`、`by_priority`、`by_type`、`by_assignee`。
- `overdue_top` 保留 schema-only shape，不做具体 numeric 强校验。
- numeric baseline 当前只作为专项检查，不进入普通 PR / push CI。

## 6. fixed snapshot dataset 结论

固定样本：

- `SNAPSHOT-BLD-001`
- `SNAPSHOT-FLR-001`
- `SNAPSHOT-UNIT-001`
- `SNAPSHOT-WO-001`

固定关联链路：

```text
SNAPSHOT-BLD-001
└── SNAPSHOT-FLR-001
    └── SNAPSHOT-UNIT-001
        └── SNAPSHOT-WO-001
```

门禁结论：

- 固定样本必须存在且唯一。
- 固定关联链路必须正确。
- `WO-%` 回归污染工单必须为 0。
- 不允许在共享污染库或写入型 e2e 后的数据集上生成 numeric baseline。

## 7. manual workflow 结论

workflow 文件：

```text
.github/workflows/api-snapshot-numeric.yml
```

workflow 名称：

```text
API Snapshot Numeric
```

job 名称：

```text
Workorders Stats Numeric Snapshot
```

触发方式：

```text
workflow_dispatch only
```

安全边界：

- 不接入 `pull_request`。
- 不接入 `push`。
- 不接入 `schedule`。
- 不允许 `UPDATE_SNAPSHOTS=true`。
- 不运行 `first-release-workorders.mjs`。
- 不运行写入型工单 e2e。
- 不连接生产库或共享污染库。

## 8. GitHub Actions 试运行结果

试运行结果：

- Run：`#1`
- Result：`succeeded`
- Duration：`2m 48s`
- 触发方式：manual `workflow_dispatch`

结论：

- manual workflow 已跑通。
- 日志末尾的 orphan processes cleanup 判断为后台 API / Node 进程正常清理，不作为失败项。

## 9. 当前推荐使用方式

### 普通回归

使用默认 schema snapshot：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

### release candidate 前专项检查

使用 GitHub Actions 手动入口：

```text
Actions -> API Snapshot Numeric -> Run workflow -> main
```

### numeric baseline 更新

不得通过 workflow 自动更新。numeric baseline 更新必须单独 PR、单独审查。

## 10. baseline 更新规则

baseline 更新规则：

- 默认 baseline 和 numeric baseline 分离维护。
- numeric baseline 更新必须单独 PR。
- PR 必须说明数据来源。
- PR 必须说明是否使用 fresh / isolated DB。
- PR 必须说明是否运行过写入型 e2e。
- baseline diff 必须人工审查。
- workflow 不允许自动提交 baseline。
- 不允许使用污染数据更新 numeric baseline。

## 11. 禁止事项

明确禁止：

- 在普通 PR CI 中运行 numeric snapshot。
- 在 push CI 中运行 numeric snapshot。
- 在 numeric workflow 中设置 `UPDATE_SNAPSHOTS=true`。
- 自动 baseline 更新。
- 运行 `first-release-workorders.mjs` 后更新 numeric baseline。
- 使用写入型 e2e 后的数据生成 numeric baseline。
- 连接生产库或共享污染库执行 numeric baseline 更新。

## 12. 后续维护建议

维护建议：

- 保持 manual workflow 作为 release candidate 前人工专项检查。
- 如 numeric baseline 变化，单独开 PR。
- 如 workflow 失败，先按 runbook 排查依赖安装、shared build、PostgreSQL、migration、seed、API readiness、bootstrap、SQL gate、default schema snapshot 和 numeric snapshot。
- 不将 numeric 检查扩大为普通 CI gate。
- 后续如增加其它 stats numeric baseline，应沿用相同的 schema / numeric 拆分、fixed dataset、独立 baseline、manual workflow 模式。

## 13. 阶段性结论

`workorders.stats` 的 schema / numeric 拆分、numeric baseline、fixed dataset、manual workflow 和手动试运行已经形成闭环。

该线可以阶段性收口。后续维护重点是保持 numeric baseline 的数据门禁和人工审查边界，不将其误扩展为普通 PR / push CI。
