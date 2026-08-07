# 修复 PR224 审查与生产部署缺陷

## Goal

修复 PR #224 合并后遗留的全部 Codex review 问题和由 `000190_admin_issue_runner_repair.sql`
触发的生产部署失败，恢复安全、可重试的 Runner 发布链路，并把本次遗漏转化为自动化门禁。

## Requirements

- 修正失败迁移的角色冲突目标，并把权限、角色、机器用户和关系初始化迁出 migration，纳入 production-safe seed。
- 所有 Admin Issue 认证端点声明最小权限；普通用户可提交、查看自己的反馈，管理员可查看和审核全量反馈。
- Runner 租约支持持有者续期；claim、renew、triage、result 在数据库锁内维护一致状态，禁止活动租约被审核改写或过期/失效 Runner 回写结果。
- APPROVED 必须基于最终有效的非空验收标准；SUCCEEDED 必须包含 CI、部署、生产健康三项结构化通过证据。
- Runner 激活工作流必须加载 SSH 私钥、校验 host key，并在成功或失败时清理本地及远端密码 hash 临时文件。
- 生产部署成功或成功回滚后删除 rollback snapshot；回滚失败时保留快照并明确输出路径。
- 反馈弹窗复用共享 Design System 表面、按钮、表单和移动记录类；我的反馈与审核视图支持服务端分页。
- 数据库/seed 变更的 PR 自动运行 release-smoke，不再依赖人工标签才能发现迁移错误。
- 对以上行为补充回归测试、运维文档和 Trellis 可执行规范；不得修改与本任务无关的功能。

## Acceptance Criteria

- [x] `000190` 只包含 `admin_issue_reports` schema，失败迁移可按更新后的 checksum 重试；Runner baseline 在幂等 production seed 中创建。
- [x] production seed 使用当前 `(tenant_id, code) WHERE is_deleted=false` 角色唯一契约，并能处理预存同 code 角色。
- [x] create/mine/detail 不再被全局 PermissionGuard 无条件拒绝，且越权详情仍返回不存在。
- [x] 活动租约可由相同 runner/token 续期；错误 runner、错误 token、过期租约和非 CLAIMED 状态均拒绝。
- [x] 活动租约期间 triage 被拒绝；recordResult 只接受当前活动 CLAIMED 租约并在锁内完成写回。
- [x] 空白验收标准不能批准；缺任一 CI/部署/生产健康证据不能发布。
- [x] 激活与部署工作流具备可验证的 SSH/敏感文件/rollback snapshot 清理语义。
- [ ] 超过单页数量的 mine/manage 历史记录可翻页，分页边界禁用正确；390px 布局无水平溢出。
- [x] 迁移/seed/相关发布脚本变更会自动触发 Release Smoke。
- [x] 目标测试、API/Web unit、lint、typecheck、build、CSS 架构检查、workflow YAML 解析和 `git diff --check` 全部通过。

## Notes

- 来源：PR #224 的 12 条未解决 Codex review、生产 run 31163829701/job 92820572718。
- 基线：`origin/main` at `c5e68bdb815b50c7852a6f3d8b730277a3729b45`。
- 生产 `000190` 已记录为 failed，SQL 由单事务包裹；按 migration runner 契约允许修正后以新 checksum 重试。
- 隔离 PostgreSQL 已验证 185 个 migration、production seed、禁用 Runner 基线和零超额权限；桌面工具因 WSL 路径无法初始化，390px 实际浏览器渲染留给 PR 预览/人工验收。
