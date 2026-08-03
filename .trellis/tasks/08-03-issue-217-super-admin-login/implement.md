# Implementation Plan

1. 在认证服务中提取与 token 授权一致的有效超级管理员判定。
2. 密码与账号状态验证后收窄唯一超级管理员候选，再执行租户有效性与歧义处理。
3. 添加登录行为回归测试，覆盖唯一超级管理员优先、多个超级管理员冲突及普通候选不回归。
4. 更新 API Trellis 认证规范。
5. 运行认证定向测试、API 完整单测、lint、typecheck、build 和 `git diff --check`。
6. 提交并推送独立分支，创建关联 #217 的 PR，请求 Codex review；不自动合并。

## Risk And Rollback

- 风险集中在无 scope 密码登录候选选择；带 tenant/park 的显式登录不改变。
- 任意异常可通过回退单一服务提交恢复原行为，无数据迁移和持久化格式变更。
