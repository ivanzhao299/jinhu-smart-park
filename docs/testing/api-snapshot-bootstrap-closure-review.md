# JinHu Smart Park 接口快照 Bootstrap 收口复核

## 1. 复核目的

本文用于复核接口快照固定数据 bootstrap 脚本是否稳定，确认是否达到阶段性收口标准，并判断下一步是否进入 baseline 更新审查。

本阶段只做文档复核，不修改 bootstrap 脚本、不修改快照脚本、不修改 baseline、不修改 seed / migration、不修改业务代码、不接入 CI。

## 2. bootstrap 脚本状态

已新增脚本：

```text
scripts/e2e/bootstrap-api-snapshot-data.mjs
```

当前状态：

- 仅手动运行。
- 未接入 CI。
- 未加入 `first-release-regression.mjs` 默认链路。
- 未修改 database seed / migration。
- 未修改业务代码。
- 未修改快照 baseline。
- 未修改 package.json / pnpm-lock.yaml。

该脚本用于通过 API 幂等检查或创建接口快照固定样本：

- `SNAPSHOT-UNIT-001`
- `SNAPSHOT-WO-001`

## 3. 当前支持能力

脚本支持环境变量：

- `API_BASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `TENANT_ID / DEFAULT_TENANT_ID`
- `PARK_ID / DEFAULT_PARK_ID`
- `SNAPSHOT_UNIT_NO`
- `SNAPSHOT_WORKORDER_NO`
- `DRY_RUN=true`

默认样本：

- `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001`
- `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001`

默认行为：

- `DRY_RUN=false`
- 使用现有 e2e 默认管理员账号登录。
- 通过 API 查询固定样本。
- 样本缺失时通过 API 创建。
- 样本已存在时只校验，不重复创建。
- 输出 `[INFO] / [PASS] / [WARN] / [FAIL]`。

## 4. 固定房源样本复核

固定房源样本处理逻辑：

- 通过 `GET /park-units` 查询房源。
- 按 `unitCode / unit_code / code` 匹配 `SNAPSHOT-UNIT-001`。
- 如果已存在，校验房源编号、房源名称和启用状态等关键字段。
- 如果不存在，先查询可用楼栋和楼层。
- 通过 `POST /park-units` 创建缺失房源。
- 创建时使用最小合法字段，并通过 API 业务校验。
- `DRY_RUN=true` 时只输出将创建固定房源，不实际写入。
- 重复运行时识别已有固定房源，不重复创建。
- 不修改非 snapshot 房源。
- 不修改 dev seed / production seed。

上一阶段验证中，`SNAPSHOT-UNIT-001` 已在本地测试环境通过 bootstrap 创建；第二次运行识别为已存在。

## 5. 固定工单样本复核

固定工单样本处理逻辑：

- 通过 `GET /work-orders` 查询工单。
- 按 `woCode / wo_code / code` 匹配 `SNAPSHOT-WO-001`。
- 如果已存在，校验工单编号、标题、类型和优先级等关键字段。
- 如果不存在，通过 `POST /work-orders` 创建缺失工单。
- 创建时尽量关联 `SNAPSHOT-UNIT-001`。
- 创建后通过 `GET /work-orders/:id/logs` 验证日志。
- `DRY_RUN=true` 时只输出将创建固定工单，不实际写入。
- 重复运行时识别已有固定工单，不重复创建。
- 不直接 SQL 插入工单或日志。
- 不作为状态流转测试对象。

上一阶段验证中，`SNAPSHOT-WO-001` 已在本地测试环境通过 bootstrap 创建；工单创建后确认存在 1 条日志；第二次运行识别为已存在。

## 6. 已完成验证

上一阶段已执行并记录：

- `node --check scripts/e2e/bootstrap-api-snapshot-data.mjs` 通过。
- `DRY_RUN=true node scripts/e2e/bootstrap-api-snapshot-data.mjs` 通过，仅输出将创建，不写入。
- `node scripts/e2e/bootstrap-api-snapshot-data.mjs` 通过，创建了 `SNAPSHOT-UNIT-001` 和 `SNAPSHOT-WO-001`。
- 第二次 `node scripts/e2e/bootstrap-api-snapshot-data.mjs` 通过，识别已有样本，未重复创建。
- `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 node scripts/e2e/first-release-api-snapshots.mjs` 可成功定位固定样本。
- `node scripts/e2e/first-release-workorders.mjs` 通过。
- `node scripts/e2e/first-release-users-assets.mjs` 通过。
- `git diff --check` 通过。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。

固定编号快照对照失败属于预期差异，不代表 bootstrap 失败。

## 7. baseline 状态

本轮未修改 baseline：

```text
scripts/e2e/snapshots/first-release-api-snapshots.json
```

复核结论：

- 固定样本创建后，快照脚本能够通过固定编号定位样本。
- 快照对照失败是预期差异。
- 原因是现有 baseline 仍指向旧样本和旧统计数据。
- 固定样本创建后会影响列表、详情、日志和统计类快照。
- baseline 更新应作为下一阶段单独处理。
- baseline 更新必须遵循 `docs/testing/api-snapshot-baseline-policy.md`。

当前不建议在 bootstrap 收口复核中顺手更新 baseline。

## 8. 当前限制

当前限制：

- bootstrap 依赖 API 可用。
- bootstrap 依赖管理员账号。
- bootstrap 依赖目标环境有可用园区 / 楼栋 / 楼层。
- 当前未设计 snapshot 专用只读账号。
- 当前未接入 workflow。
- 当前未接入 CI。
- 当前 baseline 尚未切换到固定样本。
- 固定样本创建后会影响列表和统计类快照。
- bootstrap 默认只创建缺失样本，不修复或覆盖已存在但字段不一致的样本。
- bootstrap 不清库，也不隔离已有本地脏数据。

## 9. 收口判断

建议判断：

- bootstrap 脚本可阶段性收口。
- 不建议立即接入 CI。
- 不建议立即加入 `first-release-regression.mjs` 默认链路。
- 不建议修改 production seed 或 dev seed。
- 不建议在本阶段修改快照 baseline。
- 下一步建议进入 baseline 更新审查。

理由：

- 脚本已具备手动、API 优先、幂等创建固定样本的能力。
- dry run、首次运行、重复运行和固定编号定位均已验证。
- 对现有 e2e 的基本影响已通过工单和用户资产回归验证。
- baseline 差异来源明确，适合单独审查，而不应混入 bootstrap 收口文档。

## 10. 后续建议

建议下一步进入接口快照 baseline 更新审查：

- 使用 `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001`。
- 使用 `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001`。
- 先普通检查确认差异。
- 再按维护规则更新 baseline。
- 再普通检查确认通过。
- 审查 baseline diff 是否只包含固定样本切换和统计变化。
- 确认不包含 token、密码、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL。

固定样本 baseline 更新后，再考虑：

- bootstrap 收口后的复核补充。
- 手动 workflow 设计。
- release-smoke label 设计。
- snapshot 专用只读账号设计。

当前仍不建议直接进入常规 CI。

## 11. 结论

接口快照 bootstrap 脚本已满足阶段性目标，可以阶段性收口。

当前固定样本已经可通过 API 幂等准备，快照脚本也能通过固定编号定位样本。由于 baseline 尚未切换到固定样本，固定编号快照对照失败是可解释的预期差异。下一步应单独进行 baseline 更新审查，而不是在 bootstrap 收口阶段修改 baseline、seed、CI 或业务代码。
