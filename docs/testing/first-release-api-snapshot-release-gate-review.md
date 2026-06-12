# JinHu Smart Park first release API snapshot / release gate 总复盘

## 1. 复盘目的

本文用于首版发布前统一说明 API snapshot、numeric baseline、manual workflow 和 release gate 的使用边界，作为 release candidate 前人工检查和后续 baseline 维护参考。

## 2. 当前 API snapshot 状态

当前状态：

- 默认 API snapshot 已稳定。
- `workorders.list` 已从易波动样本快照转为稳定结构快照。
- `workorders.stats` 默认路径已改为 schema snapshot。
- 默认 baseline 不再冻结动态 numeric count。
- `workorders.stats.numeric` 已使用独立 numeric baseline。
- numeric baseline 已基于 fresh / isolated DB 固定数据集生成。

## 3. 默认 API snapshot gate

默认执行方式：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

用途：

- 普通结构回归。
- API shape 检查。
- 字段和类型检查。
- 默认 `workorders.stats` schema snapshot 检查。
- 不冻结动态统计数值。

适用场景：

- 普通回归。
- release 前基础检查。
- release candidate 前的默认 API snapshot gate。

## 4. workorders.stats numeric gate

numeric 执行方式：

```bash
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

用途：

- `workorders.stats` numeric 专项检查。
- 验证 `summary` 和 `by_status` / `by_priority` / `by_type` / `by_assignee` 的统计口径。
- 只在固定数据集下运行。
- 不适合作为普通 PR / push CI。

## 5. fixed snapshot dataset gate

固定样本：

- `SNAPSHOT-BLD-001`
- `SNAPSHOT-FLR-001`
- `SNAPSHOT-UNIT-001`
- `SNAPSHOT-WO-001`

固定链路：

```text
SNAPSHOT-BLD-001
└── SNAPSHOT-FLR-001
    └── SNAPSHOT-UNIT-001
        └── SNAPSHOT-WO-001
```

门禁要求：

- 固定对象存在且唯一。
- 固定链路正确。
- `WO-% = 0`。
- 未运行 `first-release-workorders.mjs`。
- 不得使用污染库生成或更新 baseline。

## 6. manual workflow gate

workflow：

- Workflow：`API Snapshot Numeric`
- 文件：`.github/workflows/api-snapshot-numeric.yml`
- Job：`Workorders Stats Numeric Snapshot`
- 触发方式：`workflow_dispatch only`
- Run `#1`：`succeeded`
- Duration：`2m 48s`

用途：

- release candidate 前人工专项检查。
- 在 workflow 内部准备 PostgreSQL、migration、seed、API、snapshot bootstrap 和固定数据门禁。
- 先执行默认 API snapshot，再执行 numeric snapshot。
- 不进入普通 PR / push CI。

## 7. release gate 推荐执行顺序

建议发布前顺序：

1. 确认代码分支与 release candidate commit。
2. 执行常规 CI。
3. 执行默认 API snapshot。
4. 触发 `API Snapshot Numeric`。
5. 检查 workflow 结果和日志 artifact。
6. 确认未更新 baseline。
7. 确认没有污染数据参与 baseline。
8. 记录 release gate 结果。

## 8. baseline 更新规则

baseline 更新规则：

- 默认 baseline 与 numeric baseline 分离。
- baseline 更新必须单独 PR。
- numeric baseline 更新必须说明 fresh / isolated DB。
- numeric baseline 更新必须说明数据来源、运行顺序和是否运行过写入型 e2e。
- baseline diff 必须人工审查。
- workflow 不允许自动更新 baseline。
- manual workflow 中禁止出现 `UPDATE_SNAPSHOTS=true`。

## 9. 禁止事项

明确禁止：

- 普通 PR CI 自动跑 numeric snapshot。
- push CI 自动跑 numeric snapshot。
- workflow 自动更新 baseline。
- workflow 自动提交 baseline。
- 写入型 e2e 后直接生成 numeric baseline。
- 连接生产库或共享污染库。
- 为通过检查而放宽 schema / numeric gate。

## 10. release checklist

首版发布前 API snapshot / release gate checklist：

- [ ] 默认 API snapshot 通过。
- [ ] fixed snapshot dataset 正确。
- [ ] `API Snapshot Numeric` 手动 workflow 通过。
- [ ] 未运行 `UPDATE_SNAPSHOTS=true`。
- [ ] 未修改默认 baseline。
- [ ] 未修改 numeric baseline。
- [ ] numeric baseline 如有变化已走单独 PR。
- [ ] workflow 日志已检查。
- [ ] release gate 结果已记录。

## 11. 阶段性结论

首版发布前 API snapshot / release gate 已形成基础闭环。默认 schema snapshot 用于常规结构回归，numeric baseline 和 manual workflow 用于 `workorders.stats` 专项检查。

该 gate 当前可作为 release candidate 前人工检查机制保留。后续如扩大 numeric snapshot 范围，应沿用 fixed dataset、独立 baseline、manual workflow 和人工审查的边界。
