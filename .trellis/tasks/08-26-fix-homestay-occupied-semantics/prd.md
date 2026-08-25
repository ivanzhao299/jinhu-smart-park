# 修复民宿入住率与房态语义

## Goal

修复 UAT FAIL-02：将“已确认并锁定库存”与“已实际入住”分开表达，避免经营看板虚增在住房间和入住率，并让 availability 使用设计已有的可区分房态。

## Confirmed Facts

- 设计状态机为 `draft → confirmed → checked_in → checked_out`；确认订单先锁定库存，之后登记入住人、凭证并办理入住。
- 设计房态同时包含 `reserved` 与 `occupied`，房态由统一占用、入住和周转事实聚合。
- 当前 dashboard 将 `confirmed` 纳入 `occupied`；availability 将民宿 booking 的 active occupancy 统一映射为 `occupied`。
- UAT RUN_ID `20260825-212435` 已复现：`booking.status=confirmed`、`actual_check_in_time IS NULL` 时 dashboard 显示在住房间 1/入住率 100%，availability 显示 `occupied`。

## Requirements

- dashboard 的 `occupied` 与 `occupancy_rate` 采用 in-house 口径：只有已办理入住且具备实际入住事实的订单计入；不得把 confirmed-only 订单计入。
- availability 对民宿 confirmed-only 的有效库存占用返回 `reserved`，对实际在住返回 `occupied`。
- 保留长租占用为 `occupied`、周转为 `turnover`、不可售与经营模式判断的既有优先级和 API 响应形状。
- 改动限定在 dashboard/availability 查询服务及其 spec；不改订单状态机、统一占用写入、前端、shared contract 或数据库结构。
- 新增/收紧单测，覆盖 confirmed-only、in-house、混合场景的 dashboard 指标与 availability 状态。

## Acceptance Criteria

- [x] confirmed-only 在 dashboard 中 `occupied=0`、`occupancy_rate=0.00`。
- [x] checked-in/in-house 在 dashboard 中计入 `occupied`，混合 confirmed+in-house 只统计 in-house，入住率按 `occupied / rentable_units` 保留两位小数。
- [x] availability 将 confirmed-only 民宿 booking 映射为 `reserved`，将 in-house 映射为 `occupied`，并保留长租/周转既有语义。
- [x] 目标 spec、API typecheck 与 lint 通过。
- [ ] PR 经 Codex review、required CI、squash merge、main CI 与 Deploy 双绿后关闭 Issue。

## Evidence

- `docs/uat/homestay-full-flow-uat-20260825-212435.md` 的 FAIL-02、C01-B、C05-A。
- `.trellis/tasks/archive/2026-08/07-24-homestay-mvp/prd.md` 的 Core Flow / 房态与库存。
- `.trellis/tasks/archive/2026-08/07-24-homestay-mvp/design.md` 的订单状态机 / 房态。

## Out of Scope

- ADR、今日到店/离店的口径调整。
- 修改 booking/occupancy 写入模型或历史数据修复。
- P1/P2 的 rate、finance、RBAC 修复与最终浏览器复测。

## Open Questions

- 无。产品口径已由设计源与用户给定修复方向共同确定。

## Validation Evidence

- 快速 spec：5 PASS；可选 PG spec 在无 URL 时 1 SKIP。
- 隔离 PostgreSQL：251/251 migrations、8/8 prerequisites；PG spec 1 PASS，confirmed + in-house 混合结果为 `occupied=1`、`rentable_units=2`、`occupancy_rate=50.00`，availability 为 `reserved/occupied`。
- `pnpm --filter @jinhu/shared build` 后 `pnpm --filter @jinhu/api typecheck`：PASS。
- `pnpm --filter @jinhu/api lint`：PASS。
