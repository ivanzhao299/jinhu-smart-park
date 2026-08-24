# 补齐园区切换前后端闭环

## Goal

资产管理中的跨园区操作必须有可见、可验证的园区上下文切换闭环。租户管理员拥有多个园区时，应能在 Web 端看到当前园区和可访问园区，并在楼栋/楼层新增等资产写入前安全切换到目标园区，避免所有资产只能落到初始化 JH 园区。

## Requirements

- Web 端必须提供登录后园区切换入口，展示当前园区和 enabled `accessible_parks`。
- 园区切换必须复用既有 `switchParkContext(parkId)` 客户端合同，成功后更新 access token、当前用户上下文、菜单权限和页面数据。
- 切换失败必须保留当前会话并在当前页面可见报错；不得误跳登录页或继续提交业务写入。
- 楼栋管理新增楼栋必须能够选择目标园区；目标非当前园区时先完成上下文切换，再用新 token 创建楼栋。
- 楼层管理新增楼层必须能够选择目标园区，并按目标园区加载楼栋候选；目标非当前园区时先完成上下文切换，再用新 token 创建楼层。
- 新增楼层不能默认静默挂到候选第一栋楼；没有明确筛选楼栋时要求用户选择。
- 保持后端 `POST /auth/switch-context` 的同租户、enabled `rel_user_park`、active `biz_park` 校验边界；楼栋现有显式 target-park API 必须继续经 `resolveJwtPrincipal` 和目标权限校验，不新增未校验的前端 scope 绕过。
- 补充真实 HTTP/E2E 验证：同一租户两个园区，登录默认园区，切换到第二园区，再验证 `/auth/me` 和资产楼栋/楼层读写落在目标园区。
- 将 context-switch E2E 纳入 first-release regression 门禁。
- 本 Issue 不处理 refresh token family/reuse detection；普通 refresh 并发原子化如实现成本低可作为后端安全补强，否则记录为后续 Issue。

## Acceptance Criteria

- [x] GitHub Issue 记录根因、分阶段修复计划、验收矩阵和不纳入范围（Issue #310）。
- [x] Header/User menu 可见当前园区；多园区用户可选择其它 enabled 园区（PR #311 / `a6349580`）。
- [x] 切换园区成功后，`/users/me` 或 `/auth/me` 返回的 `park_id/current_park` 与目标园区一致，菜单和页面数据刷新（PR #311 / `a6349580`）。
- [x] 楼栋新增可选择归属园区；选择第二园区后新增楼栋只出现在第二园区上下文（PR #311 / `a6349580`）。
- [x] 楼层新增可选择归属园区；楼栋候选来自目标园区，新增楼层只出现在目标园区上下文（PR #311 / `a6349580`）。
- [x] 切换失败时当前 session 保留，表单不提交后续业务创建，并显示错误（PR #311 / `a6349580`）。
- [x] 普通用户只能看到其 enabled `accessible_parks`；disabled/deleted/cross-tenant 园区不可切换（PR #311 / `a6349580`）。
- [x] 新增或更新单元测试覆盖 Web 切换入口、表单跨园区写入、失败不提交、后端切换/refresh 关键边界（PR #311 / `a6349580`）。
- [ ] 新增运行态 E2E 覆盖 login -> accessible parks -> switch-context -> me -> asset write/read isolation。
- [ ] 相关 lint、typecheck、unit、E2E 通过。
- [x] 创建 Draft PR，触发 Codex review，修复审查意见后合并（PR #311 / `a6349580`）。
- [ ] 合并后跟进生产部署、health、login/context-switch smoke 和 Docker cleanup。

## Notes

- GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/310
- Root cause confirmed on latest `origin/main` (`fbefb584`): backend switch-context and Web session helper exist, building management has a partial target-park picker/API, but production UI has no global park switcher and floor management still cannot select/switch target park.
- Existing `.trellis/spec/web/frontend/index.md` already defines the browser park context switch contract; implementation must follow it.
- Referenced workflow: `01a012c1-5f4b-7ea1-a4cc-3b93cbb788b0`.
