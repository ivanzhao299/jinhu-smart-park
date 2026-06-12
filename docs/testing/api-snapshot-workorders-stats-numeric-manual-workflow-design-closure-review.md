# JinHu Smart Park workorders.stats numeric manual workflow 设计收口复核

## 1. 复核目的

本文用于复核 ST-2C-1：manual workflow 设计是否达到阶段性收口标准。

本阶段只做文档收口复核，不修改 `.github/workflows`，不修改脚本，不修改 baseline，不修改业务代码，不接入 CI。

## 2. 设计背景

默认 schema baseline 已稳定，`workorders.stats.numeric` baseline 已建立，当前 numeric 检查仍为本地手动执行。

ST-2C-1 已设计后续 manual workflow 的触发方式、运行环境、执行顺序、失败处理和安全边界。

## 3. 当前 workflow 状态

当前没有 `workorders.stats.numeric` 专用 workflow。

现有 workflow：

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`

现有 workflow 未接入 numeric snapshot。本阶段未修改 `.github/workflows/**`。

## 4. 设计定位

manual workflow 定位为：

- release candidate 前人工触发专项检查。
- 非普通 PR 必跑。
- 非 push 自动检查。
- 只检查，不更新 baseline。
- 不替代默认 schema snapshot。
- 不替代首发业务流程回归。

## 5. 触发方式收口

触发方式已收口为：

- 仅 `workflow_dispatch`。
- 不接入 `pull_request`。
- 不接入 `push`。
- 不接入 `schedule`。

## 6. 环境准备收口

推荐方案已收口为 workflow 内部自建环境：

- workflow 内部自建 PostgreSQL。
- 创建 / 使用独立测试库。
- 执行 migration。
- 执行 seed。
- 启动 API。
- 执行 snapshot bootstrap。
- 检查固定样本。
- 检查 `WO-% = 0`。

外部 `API_BASE_URL` 不作为首选方案；如后续必须支持，必须额外人工确认门禁，且仍不得更新 baseline。

## 7. 执行顺序收口

执行顺序已收口为：

1. 默认 schema snapshot。
2. numeric snapshot。
3. 上传日志。

不运行：

- `node scripts/e2e/first-release-workorders.mjs`。
- 其它会创建、派单、关闭或删除工单的写入型 e2e。

## 8. 禁止事项收口

明确禁止：

- `UPDATE_SNAPSHOTS=true`。
- 自动提交 baseline。
- 自动修复。
- 连接生产库。
- 连接共享污染库。
- 普通 CI 自动触发。
- 上传 baseline diff 作为可直接合并产物。

## 9. 失败处理收口

失败处理已收口为：

- 任一检查失败则 workflow fail。
- 上传日志 artifact。
- 上传 Docker / API 诊断日志。
- 人工分析。
- 不自动更新 baseline。
- 不自动提交任何文件。

## 10. baseline 更新规则收口

baseline 更新规则已收口：

- manual workflow 只检查，不更新 baseline。
- numeric baseline 更新仍需单独 PR。
- numeric baseline diff 必须人工审查。
- 不允许 workflow 生成或提交 baseline。
- 不允许 workflow 暴露 `UPDATE_SNAPSHOTS` 输入。

## 11. 收口判断

ST-2C-1 可阶段性收口。

可以进入 ST-2C-1B：manual workflow 小实现。

小实现仍应只新增 `workflow_dispatch` workflow，不接入 PR / push，不允许 `UPDATE_SNAPSHOTS`。

## 12. 后续建议

下一步建议进入 ST-2C-1B：manual workflow 小实现。

实现范围必须限制为：

- 新增专用 workflow。
- 仅 `workflow_dispatch`。
- 自建数据库和 API。
- schema + numeric 检查。
- 上传日志。
- 不接普通 CI。
- 不更新 baseline。
