
# 民宿任务权限与数据范围闭环

## Goal

修复 /homestay/tasks read model 未执行 assignee scope 的问题，保证 tenant/park/unit/assignee、列表与 count 同步 fail-closed。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [ ] self/custom/queue-supervisor scope 正负矩阵通过。
- [ ] arrival、departure 和未分配 turnover 保持队列可见；self/custom 不返回其他负责人的已分配 turnover。
- [ ] 空 scope 返回空页，跨园区不可见。
- [ ] unit/API/真实角色 E2E 通过。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Contract clarification

- `homestay_arrival`、`homestay_departure` 没有负责人，是园区公共队列。
- 未分配 `homestay_turnover` 必须对有权经办人可见，以支持领取。
- `current_park`/unrestricted 与 `property_task:supervise` 可查看园区全队列。
- self/custom 仅收窄已分配 `homestay_turnover`；列表与 count 使用同一谓词。

## Tracking

- GitHub Issue: #325
