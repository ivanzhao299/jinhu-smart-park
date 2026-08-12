# Implementation Plan

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/262
Trellis PRD/Design: `.trellis/tasks/08-12-property-role-productization/prd.md`, `.trellis/tasks/08-12-property-role-productization/design.md`

Base: `origin/main` @ `dad3a11ad4221bd76377e4de1f4ee5c293932640`

## 0. Planning Gate

- [x] 完整读取 AGENTS、Trellis workflow、trellis-start/brainstorm/before-dev。
- [x] 只读核对主工作区、HEAD、最新 origin/main、worktrees、PR #259 与 PR #261。
- [x] 审计 bundle/role/reconcile、scope/field policy、visible 消费者、用户角色分配、迁移/质量门。
- [x] 创建并链接中文 GitHub Issue #262。
- [x] 用户审阅 PRD/design/implement；批准后才 `task.py start`。
- [x] 从最新 origin/main 在本隔离 worktree 创建 `codex/issue-262-property-role-productization`。

## 1. Frozen Contracts And Migration

- [x] 在 shared 定义七个标准模板、bundle 组合、版本/hash、字段/动作矩阵。
- [x] 新增前向 migration，建立/扩展模板来源与 applied signature metadata；避免历史编号冲突。
- [x] 新增 production-safe reconcile：scope/predecessor/exact-set preflight、锁、审计、幂等与漂移拒绝。
- [x] 修正 Track-B visible 语义并同步 immutable migration/seed 的前向兼容合同。
- [ ] 添加静态 hash/tuple 合同、空库及 predecessor→upgrade PG fixture。

## 2. API Bundle Role Productization

- [x] 实现 catalog/preview/create/update/diff 服务端规范化器与 DTO。
- [x] merge 默认保留 extra；sync 必须显式确认删除集合与 preview signature。
- [x] 事务锁、role/bundle optimistic version、幂等 interceptor、审计与 tenant/park 权限边界。
- [x] current_park 数据范围实例化；空/未知/cross-scope/building/floor/unit fail closed。
- [x] 用户角色候选排除模板；替换保护 platform/system/builtin/非受管链接。
- [x] 字段/动作矩阵与审批摘要、敏感身份、财务动作契约测试。

## 3. Web Roles And Users

- [x] 角色管理增加 bundle 选择、权限预览、创建/更新差异、merge/sync 明示与最终集合确认。
- [x] 用户管理保存前展示最终角色集合；模板/停用/系统/越界候选不可选。
- [x] 权限/角色变更后由现有 JWT 数据库重水化与 auth-context 指纹刷新 menu/offline cache，不保留已撤销入口。
- [x] 使用 shared Design System；实现不新增固定宽度或桌面专属表格。
- [x] 增加组件逻辑、菜单/route guard、错误恢复与可访问性测试。

## 4. Automated Gates

- [x] `pnpm --filter @jinhu/shared build && pnpm --filter @jinhu/shared test`
- [x] API lint/typecheck 与定向 unit；全量 unit 仅一项因容器 Git worktree 路径失效失败（非业务断言）。
- [x] Web lint/typecheck/build、组件与菜单契约测试。
- [ ] migration 双历史/checksum、空库、非空 predecessor 升级、失败重试。
- [ ] production seed/reconcile 双跑幂等、definition/scope/extra-role 漂移拒绝。
- [ ] release-smoke、`first-release-users-assets.mjs`、menu whitelist 与相关房产业务 E2E。
- [ ] `git diff --check` 与 Trellis check；记录所有命令、结果、跳过和残余风险。

## 5. Isolated Real Browser Gate

- [ ] 仅本地隔离 PostgreSQL/API/Web，创建七类非超级管理员测试账号。
- [ ] 正向逐角色验收菜单、页面、允许动作；负向验收缺页/缺动作、maker/checker 分离。
- [ ] 跨 tenant/park 非泄露拒绝；角色停用、权限更新、换号后的会话与离线缓存失效。
- [ ] Chrome desktop 与 390px 保存截图/版本/账号角色/命令证据。
- [ ] 当前宿主若无真实 Chrome，则生成 Windows 交接，浏览器门保持 BLOCKED。

## Risk And Rollback Points

- migration/seed 写入前冻结 expected tuples/hash 并在独立 PG fixture 演练；任何漂移停止。
- bundle apply 必须 preview 与 commit 同源重算，避免 TOCTOU 和静默删除。
- 不修改主工作区，不访问生产，不 push/PR/merge/deploy；后续每阶段报告文件、验证、跳过与风险。
