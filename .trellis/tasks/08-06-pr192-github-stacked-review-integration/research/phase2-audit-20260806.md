# Phase 2 final-tree 与 evidence closure 审计（2026-08-06）

审计 HEAD 起点：`fce2b8144f4df6387923b28966d5736ae5087247`。

## 平行分支缺口

- 已知 `agent/fix-*`、`agent/refix-*` 聚合结果均为集成 HEAD 祖先。
- divergent `fix/uat-*` 的有效运行时修复均已在最终 tree 找到；不合并旧 tip。
- building/floor 删除反馈、字典加载、合同建后关联、billing item picker、floorplan
  reference detach、multipart metadata/filename 与 IoT array handling 均有当前实现。
- 结论：PASS，缺失 P0/P1/P2 = `[]`。

## Closure diff

`15b6e8f6..fce2b814` 共 232 paths：153 A、72 M、1 D、6 R；包含 106 个 app
路径和 forward migration `000199_floor_layout_deleted_file_backfill.sql`。未出现新增 env、
deployment、seed 或 GitHub workflow diff。

因此 `15b6e8f6` 的 rollback 19/19 与 performance 30/30 只能作为 ancestor-only
evidence；不能声明集成 HEAD 正式通过。最终 SHA 仍必须重新跑 disposable DB migration/
release-smoke、rollback 19/19、formal performance 30/30 和 cleanup residual=0。

## 独立 merge review 发现与修复

1. P1：`HomestayRatesClient` 切换 unit 后旧 calendar/draft 可短暂用于新 unit。
   修复为按 unit ID key 的 `RateWorkspace`，unit 变化同步 remount calendar、draft、
   override、save lock/idempotency/message 和闭包。
2. P2：identity evidence generic delete 在域鉴权前查询引用状态。
   修复为 `assertReferenceAccess` 成功后才 `assertDeletionAllowed`；增加成功顺序与鉴权
   拒绝短路测试。
3. P0：main 已有 `000183_property_business_granular_rbac.sql`，PR192 floor backfill
   原编号造成第二个非历史允许的重复迁移号。UAT 与旧开发库 history 均未出现该 floor
   filename，仓库也无成功应用证据；因此在发布前前移为新最大编号 `000199`，不改写
   既有 RBAC migration。

独立复审：APPROVE，open P0/P1=`[]`。前端目前无 React component remount test harness；
已有 key contract unit test、11/11 Web 目标测试和 Web typecheck，正式浏览器/全量 gate
仍按后续 Phase 执行。
