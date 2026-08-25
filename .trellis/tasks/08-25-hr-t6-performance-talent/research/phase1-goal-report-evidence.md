# Phase 1 目标与工作汇报实施证据

日期：2026-08-25；范围仅 T6 Phase 1，未提交、推送、部署或写生产。

## 基线与兼容

- 实施前 `HEAD = origin/main = 638cb8e635c3f3e3141d989211626cbf9d321f0e`，全部远端分支最高迁移为 `000256`，因此使用新前向迁移 `000257`。
- 未改写已成功的 `000231/000232`。旧目标、汇报保留原主键和状态，通过 `source_kind=legacy_000231`、初始版本/动作追加升级。
- 真实 pre-257 数据库副本直接升级后，旧目标、已提交汇报和基线动作均可读取且计数守恒。

## 已实现合同

- 集团→部门→员工目标层级、周期/父子日期、同级权重、跨租户园区复合外键和完整 FK 前缀索引；根/子目标写入均由周期锁串行化。
- 目标版本、动作、协作者、进度打卡证据追加保存；父目标仅服务端加权聚合。
- park/team/self/none 权限闭合；`/goals/me` 强制本人范围；部门负责人协作者仅限管理树。
- 工作汇报草稿→提交→退回→重提→确认，悲观锁和数据库状态/内容不可变触发器双保险；提交与 Workflow Inbox 同事务。
- 每次动作冻结目标建议快照，建议不直接修改目标；敏感内容读取执行 required audit，响应不暴露员工 UUID。
- Web 使用 Design System、可读选择器和 390px 移动记录，不要求用户录入 UUID。

## 验证

- 静态契约：22/22 PASS；通知事务/去敏契约：7/7 PASS。
- 真实 PostgreSQL：4/4 PASS，覆盖根/子权重并发、非法层级、self 范围、父目标聚合、并发审核、退回重提、终态不可变、追加动作、建议冻结、周期和审计 fail-closed。
- `@jinhu/shared build`、全仓 lint/typecheck/build、CSS architecture、`git diff --check`：PASS；完整 API unit 1491 项（1463 PASS、28 SKIP、0 FAIL）。
- 独立 check 从 `template0` 完成 248/248 migrations 和 8/8 prerequisites；production seed 连续两次 PASS；checksum replay 248/248 匹配。
- 精确 `000231/000232` predecessor fixture 升级到 `000257`：3 个旧目标及 1 个 confirmed 汇报升级前后计数、主键/内容 hash 保持一致，并补齐 3 个目标版本、3 个目标动作、1 个汇报动作。
- 目录审计确认 14 个租户/园区复合外键均 validated，14 个 child FK 均有完整非 partial 前缀索引，状态/终态/建议冻结触发器 enabled。

## 后续门禁

- 本地三角色桌面/390px 浏览器 UAT；提交、远端同步和生产发布均由主任务按三端一致门禁另行执行。
