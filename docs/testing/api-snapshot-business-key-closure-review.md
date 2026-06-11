# JinHu Smart Park 接口快照固定业务标识机制收口复核

## 1. 复核目的

本文用于复核接口快照固定业务标识机制是否稳定，确认该机制是否满足阶段性收口条件，并判断下一步是否进入固定测试数据设计。

本阶段只做文档复核，不修改脚本、不修改 baseline、不修改业务代码、不新增 seed、不接入 CI。

## 2. 机制实现状态

当前脚本 `scripts/e2e/first-release-api-snapshots.mjs` 已支持：

- `SNAPSHOT_WORKORDER_NO`
- `SNAPSHOT_UNIT_NO`
- `ALLOW_SNAPSHOT_FALLBACK=true`

本轮机制实施未修改：

- baseline：`scripts/e2e/snapshots/first-release-api-snapshots.json`
- CI workflow
- 业务代码
- 后端 controller / service / DTO / entity
- 前端代码
- `package.json` / `pnpm-lock.yaml`
- database migration / seed

当前脚本仍为手动运行，不接入 CI。

## 3. 工单样本定位机制

设置 `SNAPSHOT_WORKORDER_NO` 时，脚本会在 `GET /work-orders?page=1&page_size=10` 的列表结果中查找目标工单。

匹配规则：

- 按 `woCode` 精确匹配。
- 或按 `code` 精确匹配。
- `title` 仅用于诊断日志，不参与主匹配。

匹配成功后，脚本使用匹配记录的归一化前原始 `id` 继续请求：

- `GET /work-orders/:id`
- `GET /work-orders/:id/logs`

未设置 `SNAPSHOT_WORKORDER_NO` 时，脚本保持原有第一条样本策略，继续使用 `workordersList.items[0].id` 作为详情和日志样本。

## 4. 房源样本定位机制

设置 `SNAPSHOT_UNIT_NO` 时，脚本会在 `GET /park-units?page=1&page_size=10` 的列表结果中查找目标房源。

匹配规则：

- 按 `unitCode` 精确匹配。
- 或按 `code` 精确匹配。
- `unitName` 仅用于诊断日志，不参与主匹配。

匹配成功后，脚本使用匹配记录的归一化前原始 `id` 继续请求：

- `GET /park-units/:id`

未设置 `SNAPSHOT_UNIT_NO` 时，脚本保持原有第一条样本策略，继续使用 `unitsList.items[0].id` 作为详情样本。

## 5. 失败与 fallback 行为

设置业务编号但找不到目标记录时，脚本默认失败并退出非 0。

只有显式设置 `ALLOW_SNAPSHOT_FALLBACK=true` 时，脚本才允许回退到列表第一条。

fallback 行为要求：

- 输出明显 `[WARN]`。
- 日志中说明找不到的业务编号。
- 日志中说明 fallback 使用的第一条样本。
- fallback 仅用于本地临时调试。
- fallback 生成的 baseline 不建议提交。
- CI、release-smoke、manual workflow 中不应启用 fallback。

该行为可以避免固定业务编号缺失时把错误样本静默固化进 baseline。

## 6. 已完成验证

上一阶段已完成验证：

- `node --check scripts/e2e/first-release-api-snapshots.mjs` 通过。
- 普通快照检查通过，baseline 匹配。
- `SNAPSHOT_WORKORDER_NO=__NOT_FOUND__` 按预期失败，exit 1。
- `SNAPSHOT_UNIT_NO=__NOT_FOUND__` 按预期失败，exit 1。
- `SNAPSHOT_WORKORDER_NO=__NOT_FOUND__ ALLOW_SNAPSHOT_FALLBACK=true` 通过并输出 `[WARN]`。
- `SNAPSHOT_UNIT_NO=__NOT_FOUND__ ALLOW_SNAPSHOT_FALLBACK=true` 通过并输出 `[WARN]`。
- 使用当前实际 `woCode` + `unitCode` 的精确匹配模式通过。
- `git diff --check` 通过。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。

本轮复核为纯文档收口，不重复执行 API 快照脚本、lint、typecheck 或 build。

## 7. 收口判断

固定业务标识机制已满足阶段性目标：

- 支持工单固定业务编号。
- 支持房源固定业务编号。
- 找不到固定编号时默认失败。
- 支持显式 fallback，且 fallback 有明显 warning。
- 未改变未配置业务编号时的默认兼容行为。
- 未修改 baseline。
- 未接入 CI。
- 未引入 seed 或新依赖。

判断：

- 建议固定业务标识机制阶段性收口。
- 不建议立即接入 CI。
- 不建议立即新增 seed。
- 不建议立即修改 baseline。
- 建议下一步进入固定测试数据设计。

## 8. 当前限制

当前仍存在以下限制：

- 固定业务编号依赖目标环境中存在对应记录。
- 当前尚无 snapshot 专用 seed / bootstrap。
- 当前尚无 snapshot 专用只读账号。
- 未设置业务编号时仍会使用列表第一条策略。
- 工单 stats、房源 statistics 等统计值仍可能受测试库整体数据变化影响。
- fallback 需要严格避免进入 baseline 提交流程。
- 当前仍未接入 CI、release-smoke label 或手动 workflow。

## 9. 后续建议

下一步建议进入固定测试数据设计。

重点评估：

- 是否需要固定工单编号，例如 `SNAPSHOT-WO-001`。
- 是否需要固定房源编号，例如 `SNAPSHOT-UNIT-001`。
- 是否需要 snapshot bootstrap。
- 是否需要 snapshot 专用只读账号。
- 固定测试数据是否应与 production-safe seed、dev seed 严格隔离。
- baseline 更新 PR 中如何声明实际使用的业务编号。

当前继续暂缓：

- CI 接入。
- release-smoke label。
- 新增 seed。
- 扩大接口覆盖范围。
- 修改 baseline。

## 10. 结论

固定业务标识机制可阶段性收口。

该机制已经降低了快照脚本对列表第一条的依赖，并保留了未配置业务编号时的兼容行为。当前不建议继续直接扩展接口范围，也不建议立即接入 CI 或新增 seed。下一阶段应优先设计固定测试数据来源，明确推荐业务编号、数据初始化方式、维护责任和 baseline 更新规则。
