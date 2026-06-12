# JinHu Smart Park workorders.stats numeric manual workflow 评估收口复核

## 1. 复核目的

本文用于复核 ST-2C：`workorders.stats.numeric` manual workflow 评估是否达到阶段性收口标准。

本阶段只做文档收口复核，不修改 `.github/workflows`，不修改脚本，不修改 baseline，不修改业务代码，不接入 CI。

## 2. 评估背景

默认 schema baseline 已稳定，`workorders.stats.numeric` baseline 已建立，numeric 检查可通过显式环境变量在本地运行。

当前尚未接入 CI / workflow。ST-2C 用于评估是否需要后续为 numeric snapshot 增加 manual workflow，而不是直接实现 workflow。

## 3. 当前状态

当前没有 `workorders.stats.numeric` 专用 manual workflow。

现有 workflow：

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`

上述 workflow 有 `workflow_dispatch` 能力，但未接入 numeric snapshot。

当前 numeric 检查仍采用本地手动命令执行。

## 4. 当前手动执行方式

当前手动执行命令：

```bash
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

如 API 不使用默认地址，应额外设置：

```bash
API_BASE_URL=<actual-api-base-url>
```

该命令需要 fresh / reset 后固定数据集，不允许在污染库中执行后更新 baseline，也不允许自动更新 baseline。

## 5. CI / workflow 判断

评估判断：

- 不建议进入普通 PR CI。
- 不建议进入 push CI。
- 不建议自动运行 numeric snapshot。
- 短期继续本地手动执行。
- 中期可评估 `workflow_dispatch`。
- 若后续实现 workflow，也应仅作为 release candidate 前专项检查。

## 6. 后续 workflow 设计边界

如后续进入 ST-2C-1，workflow 应满足：

- 仅手动触发。
- 不跑写入型 e2e。
- 先跑默认 schema。
- 再跑 numeric。
- 失败只报错。
- 不自动修复。
- 不生成 baseline。
- 不允许 `UPDATE_SNAPSHOTS=true`。
- 不进入普通 CI。
- 不进入 push 自动检查。

## 7. baseline 更新规则

baseline 更新规则清楚：

- manual workflow 只检查，不更新 baseline。
- numeric baseline 更新必须单独 PR。
- baseline diff 必须人工审查。
- 不允许自动提交 baseline。
- 不允许用 workflow 迎合污染数据。
- 不允许在 workflow 中执行 `UPDATE_SNAPSHOTS=true`。

## 8. 当前未做事项

当前未做：

- 未修改 `.github/workflows/**`。
- 未修改脚本。
- 未修改 baseline。
- 未修改业务代码。
- 未修改 seed / migration。
- 未接入 CI。
- 未新增依赖。

## 9. 收口判断

ST-2C 可阶段性收口。

不建议立即实现 workflow。不建议进入普通 CI。

如需推进，下一步进入 ST-2C-1：manual workflow 设计。

## 10. 后续建议

短期继续本地手动 numeric 检查。

中期可进入 ST-2C-1：manual workflow 设计。ST-2C-1 仍应先设计，不直接实现 workflow；只有设计收口后，才考虑 workflow 小实现。

ST-2C-1 manual workflow 设计见 `docs/testing/api-snapshot-workorders-stats-numeric-manual-workflow-design.md`。
