# PAM-005 normalized 首跳统一

## Goal

修复 Issue #433：登录首跳、园区切换、Sidebar 与面包屑统一消费 normalized authorization tree，避免 raw tree 中 legacy/placeholder 节点成为首跳目标。

## Requirements

- 必须在 PAM-004 合并并从最新 `origin/main` 建立独立分支后实施。
- 首跳和园区切换不得复制 prune 规则，必须复用菜单层的 normalized authority helper。
- Sidebar、面包屑、当前用户和 previous user 的路由判断保持同一树语义。
- 原始树含 `/homestay`、`/housing` 或 disabled placeholder 时，首跳不得进入 Sidebar 不显示的路径。
- 纯 Web 变更，无迁移；不改变 Track-B 与刷新生效产品决策。

## Acceptance Criteria

- [ ] 登录首跳与 Sidebar 的第一个可访问菜单一致。
- [ ] legacy/placeholder 节点被统一剔除，不能成为首跳或园区切换回落目标。
- [ ] current/previous user 的园区切换判断使用同一 normalized authorization tree。
- [ ] Web 聚焦单测、lint、typecheck、build 与 CI 通过。
- [ ] PR 关闭 Issue #433，经 `@codex review` 不超过 3 轮后 squash merge，main CI 与 Deploy 双绿。

## Out of Scope

- 不修改 PAM-004 已确立的字段缺失兼容和显式空树权威语义。
- 不修改 Track-B “只进任务台”与授权“刷新后生效”语义。
