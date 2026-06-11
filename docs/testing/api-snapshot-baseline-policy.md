# JinHu Smart Park 接口快照 Baseline 维护规则

## 1. 目的

本文用于规范接口快照 baseline 的更新、审核和维护流程，避免误把真实回归更新成新 baseline。

接口快照的目标是发现接口响应结构、关键字段、统计口径和查询结果稳定性的非预期变化。baseline 不是测试失败后的兜底文件，更新 baseline 必须有明确原因、验证证据和 reviewer 可复核的说明。

## 2. 适用范围

本文适用于：

- `scripts/e2e/first-release-api-snapshots.mjs`
- `scripts/e2e/snapshots/first-release-api-snapshots.json`
- 后续新增的接口快照 baseline

当前不适用于：

- 普通 e2e 流程测试。
- 写入接口测试。
- 状态流转测试。
- 性能测试。
- 浏览器端交互测试。
- 导入导出、附件上传、认证流程等专项测试。

## 3. baseline 更新原则

核心原则：

- baseline 不是“测试失败后顺手更新”的文件。
- 只有接口响应的预期结构、关键字段、统计口径或归一化规则发生确认后的合理变化时，才允许更新 baseline。
- 任何 baseline 更新必须有原因说明。
- baseline 更新必须经过普通快照检查确认。
- baseline 更新不得掩盖真实回归。
- baseline diff 必须可读、可解释、可复核。
- baseline 更新应尽量只影响预期 snapshot，避免无关 snapshot 跟随变化。

如果无法解释快照差异，默认视为疑似回归，不允许更新 baseline。

## 4. 允许更新 baseline 的场景

允许更新 baseline 的场景包括：

- 接口响应结构按设计新增字段。
- 接口响应结构按设计删除字段。
- 关键业务字段命名按设计变更。
- 统计口径按设计变更。
- 归一化规则按设计调整。
- 固定测试数据或 seed 明确调整。
- 快照覆盖范围按计划扩展。
- baseline 当前包含不应保留的动态字段，且归一化规则已按设计修正。

每一类更新都必须有对应说明：

- 业务或接口变更 PR 说明。
- 测试设计或收口复核文档说明。
- 快照覆盖扩展计划。
- 归一化规则调整说明。
- 测试数据变化说明。

## 5. 禁止更新 baseline 的场景

以下场景禁止更新 baseline：

- 不清楚失败原因。
- 只是为了让测试通过。
- 业务代码刚改完，但未确认响应变化是否预期。
- 登录失败、权限失败、环境错误导致快照异常。
- API 服务、数据库、模块开关或本地配置异常导致快照变化。
- 本地脏数据导致快照变化。
- 时间戳、ID、token、request id、trace id 等动态字段未被正确归一化。
- 文件 URL、signed URL 或临时下载地址未被正确归一化。
- 统计值异常，但未确认是否由测试数据或统计口径变化导致。
- CI 或本地环境不稳定导致的临时差异。
- 运行了会写数据的 e2e 后，没有重新判断差异来源。
- baseline diff 包含无关接口 snapshot 的变化，且无法解释。

如果快照失败同时伴随接口 401、403、404、500、连接失败或数据库错误，应先修复环境或真实问题，不得更新 baseline。

## 6. baseline 更新前检查清单

更新前必须执行或确认：

- 当前分支干净，或只有预期变更。
- 确认 API 环境可用。
- 确认使用正确 `API_BASE_URL`。
- 确认认证账号正确。
- 确认租户 / 园区上下文正确。
- 确认本地测试数据来源清楚。
- 先运行普通快照检查，记录失败项。
- 判断失败是预期变化还是真实回归。
- 如涉及统计接口，先做关键字段人工对照。
- 如涉及归一化规则，确认动态字段不会进入 baseline。
- 如运行过会写数据的 e2e，确认这类写入是否会影响 snapshot first item 或统计值。
- 确认差异是否来自写入型 e2e、本地手动脏数据、测试库重置、seed / bootstrap 变化、排序变化或不同租户 / 园区 / 账号上下文。
- 如果数据不稳定，应先参考 `docs/testing/api-snapshot-data-stability-plan.md` 判断是否需要重置测试库、固定查询条件或调整快照锚点，不应直接更新 baseline。
- 如果后续启用固定业务标识，更新 baseline 前必须确认 `SNAPSHOT_WORKORDER_NO` / `SNAPSHOT_UNIT_NO` 对应样本存在。
- 如果后续使用固定测试数据，更新 baseline 前必须确认固定样本来源清楚，且 `SNAPSHOT-WO-001` / `SNAPSHOT-UNIT-001` 或等价样本未被写入型 e2e 修改。
- 如果后续使用 snapshot bootstrap，更新 baseline 前必须确认 bootstrap 已按预期运行，重复运行具备幂等性，且固定样本状态符合 `docs/testing/api-snapshot-bootstrap-plan.md` 的设计约束。
- 固定样本 baseline 更新必须使用固定编号环境变量，例如 `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001` 和 `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001`。
- 固定样本 baseline 更新必须记录审查文档，说明固定样本、执行命令、diff 范围、敏感信息检查和写入型 e2e 后的稳定性结论。
- 使用 `ALLOW_SNAPSHOT_FALLBACK=true` 生成的 baseline 不应提交。

建议普通检查命令：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

如果普通检查失败，先阅读失败的 snapshot name、expected 摘要和 actual 摘要，再决定是否允许更新 baseline。

## 7. baseline 更新命令

标准更新命令：

```bash
UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs
```

固定样本 baseline 更新命令：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
UPDATE_SNAPSHOTS=true \
node scripts/e2e/first-release-api-snapshots.mjs
```

更新后必须再执行普通检查：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

固定样本 baseline 更新后必须使用同样固定编号执行普通检查：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

建议同时执行：

```bash
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-users-assets.mjs
```

必要时执行：

```bash
node scripts/e2e/first-release-regression.mjs
```

注意：如果相关 e2e 会写入新数据，运行后可能再次影响 snapshot。此时需要重新判断差异来源，并在必要时重新 update baseline 后再运行普通快照检查。

对于固定样本 baseline，写入型 e2e 后出现 `workorders.list` 或 `workorders.stats` 差异时，不应直接 update baseline。应先判断是否由写入测试新增或流转工单造成；如果是，应记录为 list / stats 快照波动治理项，而不是把每次写入后的计数变化固化为 baseline。

list / stats 快照波动治理设计见 `docs/testing/api-snapshot-list-stats-stability-plan.md`。在治理完成前，写入型 e2e 后的 list 首条变化或 stats 计数变化不应作为 baseline 更新理由。

`workorders.list` 降级后，baseline 更新不应再因为默认列表第一条完整样本变化而触发。只有字段集合、pagination 结构、顶层响应结构、固定工单命中语义或明确设计的 list 快照策略变化，才应考虑更新 `workorders.list` baseline。

`contains_snapshot_workorder` 应通过工单列表实际支持的 `keyword` 查询参数分页定位固定工单，并在每页结果中按 `woCode / code` 精确匹配。不要因为固定工单被新工单挤出默认第一页而更新 baseline；这类问题应修复查询或快照策略。

`workorders.stats` numeric baseline 不应随本地写入型 e2e 的统计变化在 list 稳定性 PR 中更新；stats schema / numeric 拆分应作为后续单独治理项。

stats 拆分策略见 `docs/testing/api-snapshot-workorders-stats-split-plan.md`。拆分后，schema baseline 可在确认结构变化后更新；numeric baseline 只能在固定数据集、隔离环境或明确 reset 后更新，并必须说明数据来源和运行顺序。

当前 ST-1 已实施，默认 `workorders.stats` baseline 为 schema baseline。该 baseline 可在 stats 响应结构、字段集合或 numeric 字段类型发生预期变化时更新；具体 numeric count 仍不得由写入型 e2e 后的数据直接更新。numeric 专项模式尚未实施。

ST-1 收口复核见 `docs/testing/api-snapshot-workorders-stats-schema-closure-review.md`。在 ST-2 完成前，`workorders.stats` numeric baseline 不应作为默认 baseline 维护对象。

ST-2 numeric 专项模式设计见 `docs/testing/api-snapshot-workorders-stats-numeric-plan.md`。后续如实现 numeric baseline，建议使用独立文件 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。numeric baseline 更新必须说明数据来源、运行顺序、是否 reset、是否独立库、是否运行过写入型 e2e，并逐项解释 `summary` 和各 group count 的变化。numeric baseline 不得由写入型 e2e 后的数据直接生成或更新，也不得与 schema 策略调整混在同一 PR 中审查。

## 8. baseline 更新后检查清单

更新后必须检查：

- `git diff --check`
- 查看 baseline diff。
- 确认 baseline diff 不包含 token、密码、request id、trace id、URL、signed URL、原始 UUID、时间戳等敏感或动态字段。
- 确认字段变化符合预期。
- 确认统计字段和统计数值变化有解释。
- 确认没有无关接口 snapshot 被更新。
- 确认普通快照检查通过。
- 确认相关 e2e 回归通过。
- 确认没有提交本地临时响应文件。

建议敏感信息检查方向：

- token / accessToken / refresh token / Bearer
- password / secret
- request id / trace id
- 原始 UUID
- ISO 时间戳
- `http://` / `https://`
- `signature=` / `x-amz-` / `expires=`
- `/files/` 或临时文件下载路径

## 9. PR 说明要求

如果 PR 修改 baseline，PR 必须说明：

- 为什么更新 baseline。
- 更新了哪些 snapshot。
- 变化是预期接口变化、关键字段变化、统计口径变化、归一化规则变化，还是测试数据变化。
- 执行了哪些验证命令。
- 是否存在动态字段或敏感信息。
- 是否影响接口兼容性。
- 是否需要 reviewer 重点检查某些字段。

建议 PR 模板：

```text
## Baseline Update

更新原因：
-

更新的 snapshot：
-

变化类型：
- [ ] 预期接口结构变化
- [ ] 关键字段变化
- [ ] 统计口径变化
- [ ] 归一化规则变化
- [ ] 测试数据变化

已执行验证：
- [ ] UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs
- [ ] node scripts/e2e/first-release-api-snapshots.mjs
- [ ] node scripts/e2e/first-release-workorders.mjs
- [ ] node scripts/e2e/first-release-users-assets.mjs
- [ ] git diff --check

敏感信息检查：
- [ ] baseline diff 不包含 token / 密码 / request id / trace id / signed URL / 原始 UUID / 时间戳

兼容性说明：
-

Reviewer 重点：
-
```

如果 baseline 变化来自测试数据而不是接口结构变化，PR 必须明确说明数据来源和为什么该变化可接受。

固定样本 baseline 更新应附审查文档，例如 `docs/testing/api-snapshot-fixed-baseline-review.md`。

## 10. Reviewer 检查重点

Reviewer 应重点检查：

- baseline diff 是否合理。
- 是否只有预期 snapshot 变化。
- 是否包含动态字段。
- 是否包含敏感信息。
- 是否把真实回归更新成 baseline。
- 是否有对应设计、业务说明或测试数据说明。
- 是否已跑普通快照检查。
- 是否已跑相关 e2e 回归。
- stats / statistics 数值变化是否有明确解释。
- 是否存在大范围无关 diff。
- 是否需要调整归一化规则，而不是直接接受 baseline 变化。

如果 reviewer 无法判断差异来源，应要求补充说明或补充验证，不应直接接受 baseline 更新。

## 11. baseline 与 CI 策略

当前策略：

- 当前阶段不接入常规 CI。
- 初期手动运行。
- baseline 维护规则稳定后，可考虑接入手动 workflow 或 release-smoke label。
- 进入 CI 前必须先降低误报率。
- 进入 CI 前必须明确测试数据来源和 baseline 更新审批规则。

不建议在当前阶段直接纳入常规 PR CI。原因是当前 baseline 仍可能受本地或测试环境数据、会写数据的 e2e、统计值波动影响。

## 12. 常见问题处理

### 快照失败但接口功能正常怎么办

先查看失败的 snapshot name、expected 摘要和 actual 摘要。确认是否为响应结构、字段集合、统计口径或测试数据变化。只有确认是预期变化时，才允许更新 baseline。

### 快照失败且 baseline diff 很大怎么办

不要直接更新。先确认是否切换了环境、账号、租户、园区或测试数据。大 diff 通常需要拆分判断：结构变化、数据变化、排序变化和归一化缺口应分别说明。

### stats 数值变化怎么办

先确认是否运行过会写数据的 e2e，或测试库数据是否变化。若统计口径未变，只是测试数据变化，需要说明数据来源；若统计口径变更，需要对应设计或业务说明。

对于 `workorders.stats`，写入型 e2e 后的 numeric count 变化不应直接固化为 baseline。后续应优先使用 schema snapshot 作为默认稳定检查，numeric snapshot 作为手动专项检查。

### 本地数据导致快照变化怎么办

优先恢复或明确测试数据来源，不要把脏数据直接固化为 baseline。必要时在 PR 中说明当前 baseline 依赖的数据生成方式。

### 如何处理动态字段未归一化

不要直接接受包含动态字段的 baseline。应先设计归一化规则调整，再 update baseline，并确认 diff 不再包含动态字段原值。

### 是否可以删除 baseline 后重新生成

不建议。删除后重建会丢失可复核 diff。除非 baseline 文件损坏或进行明确的快照体系重建，否则应通过 `UPDATE_SNAPSHOTS=true` 更新并审查 diff。

## 13. 后续路线

建议路线：

1. 先执行本文 baseline 维护规则。
2. 再小范围扩展 `overdue / sla-rules`。
3. 稳定后设计手动 workflow 或 release-smoke label。
4. 不直接进入常规 CI。
5. 后续再评估用户、楼栋、楼层和兼容资产路径快照。

小范围扩展设计见 `docs/testing/api-snapshot-small-expansion-plan.md`。扩展 snapshot 时，baseline 更新仍必须按本文执行：先普通检查，再 `UPDATE_SNAPSHOTS=true`，再普通检查，并在 PR 中说明新增 snapshot、更新原因、diff 复核结论和敏感 / 动态字段检查结果。

## 14. 结论

接口快照 baseline 更新必须是受控的测试维护行为，而不是测试失败后的自动反应。

当前阶段建议先执行本文维护规则，保持手动运行，不修改脚本，不修改 baseline，不接入 CI。待 baseline 更新流程、归一化规则和测试数据来源稳定后，再考虑小范围扩展接口覆盖或设计手动 workflow。
